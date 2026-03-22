/**
 * Court Case Status & Schedule Tools
 *
 * 2 tools:
 * - search_court_case_status — пошук статусів судових справ (1.25M записів)
 * - search_court_schedule — пошук розкладу засідань (481K записів)
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

export class CourtStatusTools extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_court_case_status',
        description: `Пошук статусів судових справ (Касаційний суд та інші)

💰 Примерная стоимость: $0.001-$0.005 USD
Пошук за номером справи, суддею, учасниками або описом. 1.25M записів (2000-2025).`,
        inputSchema: {
          type: 'object',
          properties: {
            case_number: {
              type: 'string',
              description: 'Номер справи (наприклад, 352/923/16-ц)',
            },
            judge: {
              type: 'string',
              description: 'Прізвище судді',
            },
            description: {
              type: 'string',
              description: 'Ключові слова з опису справи',
            },
            court_name: {
              type: 'string',
              description: 'Назва суду',
            },
            limit: {
              type: 'number',
              default: 50,
              maximum: 100,
              description: 'Максимальна кількість результатів',
            },
          },
        },
      },
      {
        name: 'search_court_schedule',
        description: `Пошук розкладу судових засідань

💰 Примерная стоимость: $0.001-$0.005 USD
Пошук за номером справи, суддею, учасниками або назвою суду. 481K засідань (2026).`,
        inputSchema: {
          type: 'object',
          properties: {
            case_number: {
              type: 'string',
              description: 'Номер справи',
            },
            judge: {
              type: 'string',
              description: 'Прізвище судді',
            },
            participant: {
              type: 'string',
              description: 'Прізвище або назва учасника справи',
            },
            court_name: {
              type: 'string',
              description: 'Назва суду',
            },
            date_from: {
              type: 'string',
              description: 'Дата від (ДД.ММ.РРРР)',
            },
            date_to: {
              type: 'string',
              description: 'Дата до (ДД.ММ.РРРР)',
            },
            limit: {
              type: 'number',
              default: 50,
              maximum: 100,
              description: 'Максимальна кількість результатів',
            },
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    switch (name) {
      case 'search_court_case_status':
        return this.searchCaseStatus(args);
      case 'search_court_schedule':
        return this.searchSchedule(args);
      default:
        return null;
    }
  }

  private async searchCaseStatus(args: Record<string, unknown>): Promise<ToolResult> {
    const { case_number, judge, description, court_name, limit = 50 } = args as any;

    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (case_number) {
      conditions.push(`case_number = $${pi}`);
      values.push(case_number);
      pi++;
    }
    if (judge) {
      conditions.push(`(judge ILIKE $${pi} OR judges ILIKE $${pi})`);
      values.push(`%${judge}%`);
      pi++;
    }
    if (description) {
      conditions.push(`description ILIKE $${pi}`);
      values.push(`%${description}%`);
      pi++;
    }
    if (court_name) {
      conditions.push(`court_name ILIKE $${pi}`);
      values.push(`%${court_name}%`);
      pi++;
    }

    if (conditions.length === 0) {
      return this.wrapResponse('Вкажіть номер справи, суддю або опис для пошуку');
    }

    values.push(Math.min(Number(limit) || 50, 100));

    const sql = `SELECT court_name, case_number, case_type, registration_date, judge, judges, stage_date, stage_name, cause_result, description
      FROM opendata_court_case_status
      WHERE ${conditions.join(' AND ')}
      ORDER BY stage_date DESC NULLS LAST
      LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) {
        return this.wrapResponse('Статусів судових справ не знайдено за вашим запитом');
      }
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_court_case_status error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private async searchSchedule(args: Record<string, unknown>): Promise<ToolResult> {
    const { case_number, judge, participant, court_name, date_from, date_to, limit = 50 } = args as any;

    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (case_number) {
      conditions.push(`case_number = $${pi}`);
      values.push(case_number);
      pi++;
    }
    if (judge) {
      conditions.push(`judges ILIKE $${pi}`);
      values.push(`%${judge}%`);
      pi++;
    }
    if (participant) {
      conditions.push(`case_involved ILIKE $${pi}`);
      values.push(`%${participant}%`);
      pi++;
    }
    if (court_name) {
      conditions.push(`court_name ILIKE $${pi}`);
      values.push(`%${court_name}%`);
      pi++;
    }
    if (date_from) {
      conditions.push(`hearing_date >= $${pi}`);
      values.push(date_from);
      pi++;
    }
    if (date_to) {
      conditions.push(`hearing_date <= $${pi}`);
      values.push(date_to);
      pi++;
    }

    if (conditions.length === 0) {
      return this.wrapResponse('Вкажіть номер справи, суддю або учасника для пошуку розкладу');
    }

    values.push(Math.min(Number(limit) || 50, 100));

    const sql = `SELECT hearing_date, court_name, case_number, judges, court_room, case_involved, case_description
      FROM opendata_court_schedule
      WHERE ${conditions.join(' AND ')}
      ORDER BY hearing_date DESC
      LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) {
        return this.wrapResponse('Засідань не знайдено за вашим запитом');
      }
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_court_schedule error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }
}
