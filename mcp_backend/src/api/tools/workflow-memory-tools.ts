import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { WorkflowMemoryService } from '../../services/workflow-memory-service.js';
import { logger } from '../../utils/logger.js';

export class WorkflowMemoryTools extends BaseToolHandler {
  constructor(private wmService: WorkflowMemoryService) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'workflow_memory_query',
        annotations: { title: 'Запит до workflow memory', readOnlyHint: true },
        description: `Семантичний пошук по трьохрівневій workflow memory: domain-принципи, workflow-паттерни, practitioner-знання.

Використовуйте на початку сесії для завантаження релевантного контексту замість повного сканування CLAUDE.md / codebase:
- "deployment conventions for mcp_backend" → принципи CI/CD, blue-green
- "how we handle legislation parsing" → паттерни tool sequences, edit traces
- "recent changes to billing" → practitioner summaries останніх сесій

Шари (layers):
- principle — архітектурні рішення, ADR, конвенції
- pattern — повторювані послідовності інструментів, групи файлів
- practitioner — підсумки сесій, профілі експертизи, корекції

Повертає top-K результатів з score > threshold, відсортованих за релевантністю.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Семантичний запит природною мовою (англ. або укр.)',
            },
            layers: {
              type: 'array',
              items: { type: 'string', enum: ['principle', 'pattern', 'practitioner'] },
              description: 'Які шари шукати (за замовчуванням — всі три)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Фільтр за тегами (OR-логіка)',
            },
            top_k: {
              type: 'number',
              description: 'Кількість результатів (за замовчуванням 5, макс. 20)',
            },
            session_id: {
              type: 'string',
              description: 'ID поточної сесії для логування retrieval (для correction signal)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'workflow_memory_ingest',
        annotations: { title: 'Додати запис до workflow memory' },
        description: `Додати новий запис до workflow memory. Підтримує три типи:
- principle: архітектурне рішення або конвенція (потрібен principle_key)
- pattern: повторюваний паттерн роботи
- practitioner: підсумок сесії або експертне знання`,
        inputSchema: {
          type: 'object',
          properties: {
            layer: {
              type: 'string',
              enum: ['principle', 'pattern', 'practitioner'],
              description: 'Цільовий шар',
            },
            title: {
              type: 'string',
              description: 'Заголовок запису',
            },
            body: {
              type: 'string',
              description: 'Основний текст запису',
            },
            principle_key: {
              type: 'string',
              description: 'Унікальний ключ принципу (тільки для layer=principle)',
            },
            pattern_type: {
              type: 'string',
              description: 'Тип паттерну: tool_sequence, edit_trace, file_group (тільки для layer=pattern)',
            },
            knowledge_type: {
              type: 'string',
              description: 'Тип знання: session_summary, expertise_profile, correction (тільки для layer=practitioner)',
            },
            source: { type: 'string', description: 'Джерело (adr, claude_md, pr_review, ...)' },
            source_ref: { type: 'string', description: 'Посилання на джерело (URL, шлях файлу)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Теги для фільтрації' },
            session_id: { type: 'string' },
            commit_range: { type: 'string' },
            files_touched: { type: 'array', items: { type: 'string' } },
            tools_used: { type: 'array', items: { type: 'string' } },
            pattern_data: { type: 'object', description: 'Структуровані дані паттерну (JSON)' },
          },
          required: ['layer', 'title', 'body'],
        },
      },
      {
        name: 'workflow_memory_stats',
        annotations: { title: 'Статистика workflow memory', readOnlyHint: true, idempotentHint: true },
        description: 'Кількість записів у кожному шарі workflow memory та загальна статистика.',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    try {
      switch (name) {
        case 'workflow_memory_query':
          return await this.handleQuery(args);
        case 'workflow_memory_ingest':
          return await this.handleIngest(args);
        case 'workflow_memory_stats':
          return await this.handleStats();
        default:
          return null;
      }
    } catch (err: any) {
      logger.error(`WorkflowMemoryTools.${name} failed`, { error: err.message });
      return { content: [{ type: 'text', text: `Помилка: ${err.message}` }], isError: true };
    }
  }

  private async handleQuery(args: any): Promise<ToolResult> {
    const topK = Math.min(args.top_k ?? 5, 20);

    const result = await this.wmService.query({
      query: args.query,
      layers: args.layers,
      tags: args.tags,
      topK,
      sessionId: args.session_id,
    });

    if (result.hits.length === 0) {
      return this.wrapResponse({
        message: 'Нічого не знайдено у workflow memory за цим запитом.',
        layers_searched: result.layers_searched,
      });
    }

    const formatted = result.hits.map(h => ({
      layer: h.layer,
      title: h.title,
      score: Math.round(h.score * 1000) / 1000,
      tags: h.tags,
      body: h.body,
      ...(h.source && { source: h.source }),
      ...(h.metadata && Object.keys(h.metadata).length > 0 && { metadata: h.metadata }),
    }));

    return this.wrapResponse({
      hits: formatted,
      count: formatted.length,
      layers_searched: result.layers_searched,
    });
  }

  private async handleIngest(args: any): Promise<ToolResult> {
    const { layer, title, body } = args;
    let id: number;

    switch (layer) {
      case 'principle':
        if (!args.principle_key) {
          return { content: [{ type: 'text', text: 'Помилка: principle_key обовʼязковий для layer=principle' }], isError: true };
        }
        id = await this.wmService.ingestPrinciple({
          principleKey: args.principle_key,
          title, body,
          source: args.source,
          sourceRef: args.source_ref,
          tags: args.tags,
        });
        break;

      case 'pattern':
        id = await this.wmService.ingestPattern({
          patternType: args.pattern_type ?? 'edit_trace',
          description: `${title}\n${body}`,
          patternData: args.pattern_data,
          sessionIds: args.session_id ? [args.session_id] : [],
          tags: args.tags,
        });
        break;

      case 'practitioner':
        id = await this.wmService.ingestPractitioner({
          knowledgeType: args.knowledge_type ?? 'session_summary',
          title, body,
          sessionId: args.session_id,
          commitRange: args.commit_range,
          filesTouched: args.files_touched,
          toolsUsed: args.tools_used,
          tags: args.tags,
        });
        break;

      default:
        return { content: [{ type: 'text', text: `Невідомий шар: ${layer}` }], isError: true };
    }

    return this.wrapResponse({ ok: true, layer, id, message: `Запис додано до ${layer} (id=${id})` });
  }

  private async handleStats(): Promise<ToolResult> {
    const stats = await this.wmService.getStats();
    return this.wrapResponse({
      layers: {
        principles: stats.principles,
        patterns: stats.patterns,
        practitioner: stats.practitioner,
      },
      total_entries: stats.principles + stats.patterns + stats.practitioner,
      total_retrievals: stats.retrievals,
    });
  }
}
