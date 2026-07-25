/**
 * Open Data Registries Tools — bespoke tools with non-parametric patterns
 *
 * 1 tool:
 * - search_judges — conditional table (judges vs judges_current based on include_history)
 *
 * The other 8 tools formerly here are now served by search_registry (registry-search-tool.ts).
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

export class OpenDataRegistriesTools extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_judges',
        annotations: { title: 'Реєстр суддів', readOnlyHint: true },
        description: `Пошук суддів у реєстрі ВККС

6K поточних суддів + 417K історичних записів. Пошук за прізвищем, судом, статтю, досьє.`,
        inputSchema: {
          type: 'object',
          properties: {
            full_name: { type: 'string', description: 'ПІБ судді' },
            court_name: { type: 'string', description: 'Назва суду' },
            dossier_number: { type: 'string', description: 'Номер досьє' },
            gender: { type: 'string', description: 'Стать (чоловіча/жіноча)' },
            include_history: { type: 'boolean', default: false, description: 'Включити історичні записи (таблиця judges, 417K)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    if (name !== 'search_judges') return null;
    return this.searchJudges(args);
  }

  private async searchJudges(args: Record<string, unknown>): Promise<ToolResult> {
    const { full_name, court_name, dossier_number, gender, include_history = false, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (full_name) { conditions.push(`full_name ILIKE $${pi}`); values.push(`%${full_name}%`); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (dossier_number) { conditions.push(`dossier_number = $${pi}`); values.push(dossier_number); pi++; }
    if (gender) { conditions.push(`gender = $${pi}`); values.push(gender); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ПІБ, суд або номер досьє для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);

    const table = include_history ? 'judges' : 'judges_current';
    const extraCols = include_history
      ? ', snapshot_date'
      : ', first_seen, last_seen, snapshot_count';
    const orderBy = include_history
      ? 'snapshot_date DESC NULLS LAST'
      : 'last_seen DESC NULLS LAST';

    const sql = `SELECT dossier_number, full_name, gender, court_name${extraCols}
      FROM ${table}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy} LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Суддів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_judges error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }
}
