import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { ABTestingService } from '../../services/ab-testing-service.js';
import { logger } from '../../utils/logger.js';

export class ABTestingTools extends BaseToolHandler {
  constructor(private abService: ABTestingService) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'ab_create_experiment',
        annotations: { title: 'Створити A/B експеримент' },
        description: `Створити новий A/B експеримент для порівняння моделей, промптів або фіч.

Приклад для порівняння моделей Bedrock:
{
  "name": "sonnet-4.5-vs-4.6",
  "experiment_type": "model",
  "target_budget": "standard",
  "traffic_pct": 50,
  "config": {
    "variants": [
      { "name": "control", "model": "eu.anthropic.claude-sonnet-4-5-20250929-v1:0", "weight": 50 },
      { "name": "treatment", "model": "eu.anthropic.claude-sonnet-4-6", "weight": 50 }
    ]
  }
}

Статуси: draft → running → paused/completed. Тільки running експерименти впливають на трафік.`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Унікальна назва експерименту' },
            description: { type: 'string', description: 'Опис експерименту' },
            experiment_type: {
              type: 'string',
              enum: ['model', 'prompt', 'feature'],
              description: 'Тип: model (заміна моделі), prompt (зміна промпту), feature (фіча-флаг)',
            },
            config: {
              type: 'object',
              description: 'Конфігурація з масивом variants: [{ name, model?, weight }]',
              properties: {
                variants: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      model: { type: 'string' },
                      weight: { type: 'number' },
                    },
                    required: ['name', 'weight'],
                  },
                },
              },
              required: ['variants'],
            },
            target_budget: {
              type: 'string',
              enum: ['quick', 'standard', 'deep'],
              description: 'Який budget tier перехоплювати (null = всі)',
            },
            traffic_pct: {
              type: 'number',
              description: 'Відсоток користувачів, що потрапляють в експеримент (0-100, за замовчуванням 100)',
            },
          },
          required: ['name', 'config'],
        },
      },
      {
        name: 'ab_list_experiments',
        annotations: { title: 'Список A/B експериментів', readOnlyHint: true },
        description: 'Отримати список A/B експериментів з опціональним фільтром за статусом.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['draft', 'running', 'paused', 'completed'],
              description: 'Фільтр за статусом',
            },
          },
        },
      },
      {
        name: 'ab_update_status',
        annotations: { title: 'Оновити статус A/B експерименту' },
        description: `Змінити статус експерименту: running (запустити), paused (призупинити), completed (завершити).
Тільки running експерименти впливають на розподіл трафіку.`,
        inputSchema: {
          type: 'object',
          properties: {
            experiment_id: { type: 'string', description: 'ID експерименту' },
            status: {
              type: 'string',
              enum: ['running', 'paused', 'completed'],
              description: 'Новий статус',
            },
          },
          required: ['experiment_id', 'status'],
        },
      },
      {
        name: 'ab_get_results',
        annotations: { title: 'Результати A/B експерименту', readOnlyHint: true },
        description: `Агреговані результати по варіантах: кількість юзерів, подій, середня вартість, latency, токени, помилки.`,
        inputSchema: {
          type: 'object',
          properties: {
            experiment_id: { type: 'string', description: 'ID експерименту' },
          },
          required: ['experiment_id'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    try {
      switch (name) {
        case 'ab_create_experiment':
          return await this.handleCreate(args);
        case 'ab_list_experiments':
          return await this.handleList(args);
        case 'ab_update_status':
          return await this.handleUpdateStatus(args);
        case 'ab_get_results':
          return await this.handleResults(args);
        default:
          return null;
      }
    } catch (err: any) {
      logger.error(`ABTestingTools.${name} failed`, { error: err.message });
      return { content: [{ type: 'text', text: `Помилка: ${err.message}` }], isError: true };
    }
  }

  private async handleCreate(args: any): Promise<ToolResult> {
    if (!args.config?.variants || args.config.variants.length < 2) {
      return this.wrapError('Потрібно мінімум 2 варіанти');
    }

    const experiment = await this.abService.createExperiment({
      name: args.name,
      description: args.description,
      experiment_type: args.experiment_type,
      config: args.config,
      target_budget: args.target_budget,
      traffic_pct: args.traffic_pct,
    });

    return this.wrapResponse({
      ok: true,
      experiment,
      message: `Експеримент "${experiment.name}" створено (id: ${experiment.id}, статус: draft). Використайте ab_update_status для запуску.`,
    });
  }

  private async handleList(args: any): Promise<ToolResult> {
    const experiments = await this.abService.listExperiments(args.status);
    return this.wrapResponse({
      experiments: experiments.map(e => ({
        id: e.id,
        name: e.name,
        status: e.status,
        experiment_type: e.experiment_type,
        target_budget: e.target_budget,
        traffic_pct: e.traffic_pct,
        variants: e.config.variants.map(v => `${v.name}(${v.weight}%)${v.model ? ` → ${v.model}` : ''}`),
        created_at: e.created_at,
        started_at: e.started_at,
        ended_at: e.ended_at,
      })),
      count: experiments.length,
    });
  }

  private async handleUpdateStatus(args: any): Promise<ToolResult> {
    const experiment = await this.abService.updateExperimentStatus(args.experiment_id, args.status);
    if (!experiment) {
      return this.wrapError(`Експеримент ${args.experiment_id} не знайдено`);
    }
    return this.wrapResponse({
      ok: true,
      experiment: { id: experiment.id, name: experiment.name, status: experiment.status },
      message: `Статус "${experiment.name}" змінено на ${experiment.status}`,
    });
  }

  private async handleResults(args: any): Promise<ToolResult> {
    const experiment = await this.abService.getExperiment(args.experiment_id);
    if (!experiment) {
      return this.wrapError(`Експеримент ${args.experiment_id} не знайдено`);
    }

    const results = await this.abService.getExperimentResults(args.experiment_id);

    return this.wrapResponse({
      experiment: { id: experiment.id, name: experiment.name, status: experiment.status },
      results,
      summary: results.length === 0
        ? 'Ще немає подій для цього експерименту.'
        : results.map(r =>
            `${r.variant_name}: ${r.user_count} юзерів, ${r.event_count} подій, avg cost $${r.avg_cost_usd?.toFixed(4) ?? 'N/A'}, avg latency ${r.avg_latency_ms?.toFixed(0) ?? 'N/A'}ms`
          ).join('\n'),
    });
  }
}
