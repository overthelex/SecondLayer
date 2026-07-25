/**
 * TIER 1 Open Data Tools — bespoke tools with multi-table query patterns
 *
 * 2 tools:
 * - search_invalid_passports — queries 2 tables (internal + foreign passports)
 * - search_terrorism_list — queries 2 tables (persons + organizations)
 *
 * The other 4 tools formerly here are now served by search_registry (registry-search-tool.ts).
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

export class Tier1OpenDataTools extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_invalid_passports',
        annotations: { title: 'Недійсні паспорти (МВС)', readOnlyHint: true },
        description: `Перевірка паспорта у реєстрі недійсних документів (МВС)

2.9M внутрішніх + 195K закордонних паспортів. Статуси: ВТРАЧЕНО, ВИКРАДЕНО, ВЛАСНИК РОЗШУКУЄТЬСЯ тощо.
Пошук за серією та номером, або за OВД.`,
        inputSchema: {
          type: 'object',
          properties: {
            d_series: { type: 'string', description: 'Серія паспорта (напр. АР, ЕН)' },
            d_number: { type: 'string', description: 'Номер паспорта' },
            ovd: { type: 'string', description: 'Орган, що видав (пошук за текстом)' },
            d_status: { type: 'string', description: 'Статус (ВТРАЧЕНО, ВИКРАДЕНО тощо)' },
            include_foreign: { type: 'boolean', default: true, description: 'Включити закордонні паспорти' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_terrorism_list',
        annotations: { title: 'Перелік терористів', readOnlyHint: true },
        description: `Пошук у переліку осіб та організацій пов'язаних з тероризмом (ДСФМУ)

AML/sanctions screening. Перелік ДСФМУ — першоджерело для банків та фінустанов.
Включає фізосіб під санкціями та терористичні організації.`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "Ім'я або назва організації (укр. або англ.)" },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
          required: ['name'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    switch (name) {
      case 'search_invalid_passports': return this.searchInvalidPassports(args);
      case 'search_terrorism_list': return this.searchTerrorismList(args);
      default: return null;
    }
  }

  private async searchInvalidPassports(args: Record<string, unknown>): Promise<ToolResult> {
    const { d_series, d_number, ovd, d_status, include_foreign = true, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (d_series) { conditions.push(`d_series = $${pi}`); values.push(d_series.toUpperCase()); pi++; }
    if (d_number) { conditions.push(`d_number = $${pi}`); values.push(d_number); pi++; }
    if (ovd) { conditions.push(`ovd ILIKE $${pi}`); values.push(`%${ovd}%`); pi++; }
    if (d_status) { conditions.push(`d_status ILIKE $${pi}`); values.push(`%${d_status}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть серію та номер паспорта для перевірки');

    const lim = Math.min(Number(limit) || 50, 100);
    const where = conditions.join(' AND ');

    try {
      const queries: string[] = [
        `SELECT id, d_series, d_number, d_type, d_status, ovd, theft_date, insert_date, 'internal' as passport_type
         FROM opendata_invalid_passports WHERE ${where} ORDER BY insert_date DESC NULLS LAST LIMIT ${lim}`,
      ];
      if (include_foreign) {
        queries.push(
          `SELECT id, d_series, d_number, d_type, d_status, ovd, theft_date, insert_date, 'foreign' as passport_type
           FROM opendata_invalid_passports_foreign WHERE ${where} ORDER BY insert_date DESC NULLS LAST LIMIT ${lim}`
        );
      }

      const results = [];
      for (const sql of queries) {
        const result = await this.db.query(sql, values);
        results.push(...result.rows);
      }

      if (results.length === 0) return this.wrapResponse('Паспорт не знайдено у реєстрі недійсних документів');
      const sliced = results.slice(0, lim);
      return this.wrapResponse({ results: sliced, total_count: results.length, has_more: results.length > lim, limit: lim, offset: 0 });
    } catch (error: any) {
      logger.error('search_invalid_passports error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private async searchTerrorismList(args: Record<string, unknown>): Promise<ToolResult> {
    const { name, limit = 50 } = args as any;
    if (!name) return this.wrapResponse("Вкажіть ім'я або назву для пошуку");

    const lim = Math.min(Number(limit) || 50, 100);

    try {
      const personsResult = await this.db.query(`
        SELECT 'person' as entity_type, name_ua, name_en, doc_type, sanctions_type, row_data
        FROM opendata_terrorism_persons
        WHERE name_ua ILIKE $1 OR name_en ILIKE $1
        LIMIT $2
      `, [`%${name}%`, lim]);

      const orgsResult = await this.db.query(`
        SELECT 'organization' as entity_type, name_ua, name_en, head_name_ua, head_name_en,
          org_country, report_date, report_num
        FROM opendata_terrorism_orgs
        WHERE name_ua ILIKE $1 OR name_en ILIKE $1 OR name_ua_short ILIKE $1
        LIMIT $2
      `, [`%${name}%`, lim]);

      const results = [...personsResult.rows, ...orgsResult.rows];
      if (results.length === 0) return this.wrapResponse('Осіб/організацій у переліку ДСФМУ не знайдено');
      return this.wrapResponse({
        results,
        total_count: results.length,
        has_more: false,
        limit: lim,
        offset: 0,
      });
    } catch (error: any) {
      logger.error('search_terrorism_list error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }
}
