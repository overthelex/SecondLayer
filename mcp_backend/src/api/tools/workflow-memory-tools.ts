import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { WorkflowMemoryService } from '../../services/workflow-memory-service.js';
import { WorkflowMemoryPushService } from '../../services/workflow-memory-push-service.js';
import { logger } from '../../utils/logger.js';

export class WorkflowMemoryTools extends BaseToolHandler {
  private pushService?: WorkflowMemoryPushService;

  constructor(private wmService: WorkflowMemoryService) {
    super();
  }

  setPushService(pushService: WorkflowMemoryPushService): void {
    this.pushService = pushService;
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
        name: 'workflow_memory_reconcile',
        annotations: { title: 'Reconciliation сесії workflow memory' },
        description: `Post-session reconciliation: порівнює, що було знайдено в workflow memory під час сесії з тим, що реально використано.

Запускайте після завершення сесії або PR. Визначає:
- retrieval misses — принципи, релевантні до змінених файлів, але не знайдені
- spurious retrievals — знайдені, але не використані принципи
- precision / recall метрики якості retrieval
- кандидати на нові принципи

Потрібен session_id та список змінених файлів.`,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'ID сесії для reconciliation',
            },
            files_touched: {
              type: 'array',
              items: { type: 'string' },
              description: 'Список файлів, змінених у сесії',
            },
            commit_range: {
              type: 'string',
              description: 'Діапазон комітів (first..last)',
            },
            tools_used: {
              type: 'array',
              items: { type: 'string' },
              description: 'Інструменти, використані в сесії',
            },
            prompts_count: {
              type: 'number',
              description: 'Кількість промптів у сесії',
            },
          },
          required: ['session_id', 'files_touched'],
        },
      },
      {
        name: 'workflow_memory_push_refresh',
        annotations: { title: 'Push-mode refresh для dormant tasks' },
        description: `Запускає push-mode refresh: оновлює workflow memory для задач, які були неактивні.
Для кожної задачі генерує executive summary змін, tool lineage delta, та open questions.
Результати записуються як pattern entries у workflow memory.

Використовуйте для підтримки актуальності контексту довгострокових задач.`,
        inputSchema: {
          type: 'object',
          properties: {
            max_age_days: {
              type: 'number',
              description: 'Мінімальний вік останнього refresh (за замовчуванням 1 день)',
            },
            task_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Конкретні task IDs для refresh (за замовчуванням — всі due)',
            },
          },
        },
      },
      {
        name: 'workflow_memory_push_sync_tasks',
        annotations: { title: 'Синхронізувати Plane задачі до watchlist' },
        description: `Додає або оновлює Plane задачі у push-mode watchlist.
Задачі з watchlist автоматично отримують refresh при виклику workflow_memory_push_refresh.`,
        inputSchema: {
          type: 'object',
          properties: {
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  project_id: { type: 'string' },
                  labels: { type: 'array', items: { type: 'string' } },
                },
                required: ['id', 'name', 'project_id'],
              },
              description: 'Масив задач для додавання до watchlist',
            },
          },
          required: ['tasks'],
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
        case 'workflow_memory_reconcile':
          return await this.handleReconcile(args);
        case 'workflow_memory_push_refresh':
          return await this.handlePushRefresh(args);
        case 'workflow_memory_push_sync_tasks':
          return await this.handlePushSyncTasks(args);
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

  private async handleReconcile(args: any): Promise<ToolResult> {
    const result = await this.wmService.reconcileSession({
      sessionId: args.session_id,
      filesTouched: args.files_touched ?? [],
      commitRange: args.commit_range,
      toolsUsed: args.tools_used,
      promptsCount: args.prompts_count,
    });

    return this.wrapResponse({
      reconciliation_id: result.reconciliationId,
      retrieved: result.retrievedCount,
      relevant: result.relevantCount,
      missed: result.missedCount,
      spurious: result.spuriousCount,
      precision: result.precision !== null ? Math.round(result.precision * 1000) / 1000 : null,
      recall: result.recall !== null ? Math.round(result.recall * 1000) / 1000 : null,
      candidates: result.candidates,
      message: result.missedCount > 0
        ? `Знайдено ${result.missedCount} retrieval miss(es) — принципи, які могли бути корисними, але не були знайдені.`
        : 'Усі релевантні принципи були знайдені під час сесії.',
    });
  }

  private async handlePushRefresh(args: any): Promise<ToolResult> {
    if (!this.pushService) {
      return { content: [{ type: 'text', text: 'Push service не налаштований' }], isError: true };
    }

    const maxAgeDays = args.max_age_days ?? 1;
    let tasks = await this.pushService.getTasksDueForRefresh(maxAgeDays);

    if (args.task_ids?.length) {
      tasks = tasks.filter(t => args.task_ids.includes(t.taskId));
    }

    if (tasks.length === 0) {
      return this.wrapResponse({ message: 'Немає задач, що потребують refresh.', refreshed: 0 });
    }

    const results = [];
    for (const task of tasks) {
      try {
        const result = await this.pushService.refreshTask(task);

        // Ingest the refresh summary as a workflow pattern
        await this.wmService.ingestPattern({
          patternType: 'push_refresh',
          description: `[Push refresh] ${task.taskName}\n\n${result.summary}${result.openQuestions.length > 0 ? '\n\nOpen questions:\n' + result.openQuestions.map(q => '- ' + q).join('\n') : ''}`,
          patternData: {
            taskId: task.taskId,
            commitRange: result.commitRange,
            toolDeltas: result.toolDeltas,
            openQuestions: result.openQuestions,
          },
          tags: [...task.tags, 'push-refresh'],
        });

        results.push({
          taskId: task.taskId,
          taskName: task.taskName,
          summary: result.summary.slice(0, 200),
          toolDeltas: result.toolDeltas.length,
          openQuestions: result.openQuestions.length,
        });
      } catch (err: any) {
        results.push({ taskId: task.taskId, taskName: task.taskName, error: err.message });
      }
    }

    return this.wrapResponse({ refreshed: results.filter(r => !('error' in r)).length, results });
  }

  private async handlePushSyncTasks(args: any): Promise<ToolResult> {
    if (!this.pushService) {
      return { content: [{ type: 'text', text: 'Push service не налаштований' }], isError: true };
    }

    const tasks = (args.tasks ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      projectId: t.project_id,
      labels: t.labels ?? [],
    }));

    const synced = await this.pushService.syncPlaneTasksToWatchlist(tasks);
    return this.wrapResponse({ synced, message: `${synced} задач додано/оновлено у watchlist.` });
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
      total_reconciliations: stats.reconciliations ?? 0,
      ...(this.pushService ? { push_mode: await this.pushService.getStats().catch(() => ({ watchedTasks: 0, totalRefreshes: 0, toolSnapshots: 0 })) } : {}),
    });
  }
}
