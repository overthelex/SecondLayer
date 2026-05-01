/**
 * Import Task Tools — MCP tools for managing multi-IP data imports.
 *
 * 4 tools: list_import_sources, start_import, get_import_status, cancel_import
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { ImportTaskService } from '../../services/import-task-service.js';
import { logger } from '../../utils/logger.js';

export class ImportTaskTools extends BaseToolHandler {
  constructor(private importService: ImportTaskService) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'list_import_sources',
        annotations: { title: 'Каталог джерел імпорту', readOnlyHint: true, idempotentHint: true },
        description: 'Показати каталог джерел даних для імпорту (data.gov.ua, НІПО тощо). Кожне джерело має тип, URL, цільову таблицю.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'start_import',
        annotations: { title: 'Запустити імпорт даних' },
        description: 'Запустити фонову задачу імпорту з використанням 10 IP-адрес та багатопотокового завантаження. Повертає task_id для відстеження.',
        inputSchema: {
          type: 'object',
          properties: {
            source_name: {
              type: 'string',
              description: 'Назва джерела з каталогу (наприклад: nipo_trademarks, mvs_wanted_persons)',
            },
            from_page: {
              type: 'number',
              description: 'Сторінка для продовження (за замовчуванням 1)',
            },
            threads_per_ip: {
              type: 'number',
              description: 'Кількість потоків на IP (за замовчуванням 5)',
            },
          },
          required: ['source_name'],
        },
      },
      {
        name: 'get_import_status',
        annotations: { title: 'Статус імпорту', readOnlyHint: true },
        description: 'Статус імпортних задач: прогрес, швидкість, ETA. Без параметрів — всі активні задачі.',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'number',
              description: 'ID задачі (пропустити — всі задачі)',
            },
            status: {
              type: 'string',
              description: 'Фільтр за статусом: running, completed, failed, cancelled',
            },
          },
        },
      },
      {
        name: 'cancel_import',
        annotations: { title: 'Скасувати імпорт', destructiveHint: true },
        description: 'Скасувати запущену задачу імпорту. Зупиняє всі потоки та зберігає прогрес.',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'number',
              description: 'ID задачі для скасування',
            },
          },
          required: ['task_id'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    try {
      switch (name) {
        case 'list_import_sources':
          return await this.handleListSources();
        case 'start_import':
          return await this.handleStartImport(args);
        case 'get_import_status':
          return await this.handleGetStatus(args);
        case 'cancel_import':
          return await this.handleCancelImport(args);
        default:
          return null;
      }
    } catch (err: any) {
      logger.error(`[ImportTaskTools] ${name} error`, { error: err.message });
      return this.wrapError(err.message);
    }
  }

  private async handleListSources(): Promise<ToolResult> {
    const sources = await this.importService.listSources();
    return this.wrapResponse({
      total: sources.length,
      sources: sources.map(s => ({
        name: s.name,
        title: s.title,
        type: s.source_type,
        url: s.source_url,
        target_table: s.target_table,
        threads_per_ip: s.default_threads_per_ip,
        rate_limit_ms: s.rate_limit_ms,
        enabled: s.enabled,
      })),
    });
  }

  private async handleStartImport(args: any): Promise<ToolResult> {
    const result = await this.importService.startImport({
      sourceName: args.source_name,
      fromPage: args.from_page,
      threadsPerIp: args.threads_per_ip,
    });
    return this.wrapResponse(result);
  }

  private async handleGetStatus(args: any): Promise<ToolResult> {
    if (args.task_id) {
      const status = await this.importService.getTaskStatus(args.task_id);
      if (!status) return this.wrapError(`Задачу ${args.task_id} не знайдено`);
      return this.wrapResponse(status);
    }

    const tasks = await this.importService.listTasks(args.status ? { status: args.status } : undefined);
    return this.wrapResponse({
      total: tasks.length,
      tasks: tasks.map(t => ({
        id: t.id,
        source: t.source_name,
        status: t.status,
        progress: t.total_pages ? `${t.pages_done}/${t.total_pages} (${Math.round((t.pages_done / t.total_pages) * 100)}%)` : `${t.pages_done} pages`,
        records: `${t.records_imported} imported, ${t.records_failed} failed`,
        elapsed: t.elapsed_ms > 60000 ? `${Math.round(t.elapsed_ms / 60000)}m` : `${Math.round(t.elapsed_ms / 1000)}s`,
        started: t.started_at,
        last_error: t.last_error,
      })),
    });
  }

  private async handleCancelImport(args: any): Promise<ToolResult> {
    const ok = await this.importService.cancelTask(args.task_id);
    return this.wrapResponse({
      success: ok,
      message: ok ? `Задачу ${args.task_id} скасовано` : `Не вдалося скасувати задачу ${args.task_id}`,
    });
  }
}
