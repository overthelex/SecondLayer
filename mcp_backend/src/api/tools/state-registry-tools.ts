/**
 * State Registry Tools - NBU bank registry
 *
 * 1 tool:
 * - search_nbu_banks — пошук банків з ліцензією НБУ
 *
 * Note: search_erb_debtors removed — debtors data lives in OpenReyestr DB,
 * accessible via openreyestr_search_debtors tool.
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

export class StateRegistryTools extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_nbu_banks',
        description: `Пошук банків з ліцензією Національного банку України

Реєстр містить усі банки України з банківською ліцензією НБУ (60 банків).
Пошук за назвою, кодом ЄДРПОУ або статусом. Включає дату ліцензії, адресу, телефон, сайт.
Джерело: bank.gov.ua (Open Data API)`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Назва банку або частина назви (пошук по вхожденню)',
            },
            edrpou: {
              type: 'string',
              description: 'Код ЄДРПОУ банку',
            },
            status: {
              type: 'string',
              enum: ['Нормальний', 'Неплатоспроможний', 'В стані ліквідації'],
              description: 'Статус банку',
            },
          },
          required: [],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'search_nbu_banks':
        return await this.searchNbuBanks(args);
      default:
        return null;
    }
  }

  private async searchNbuBanks(args: any): Promise<ToolResult> {
    const query = args.query?.trim();
    const edrpou = args.edrpou?.trim();
    const status = args.status?.trim();

    logger.info('[MCP Tool] search_nbu_banks', { query, edrpou, status });

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (edrpou) {
        conditions.push(`kod_edrpou = $${paramIdx++}`);
        params.push(edrpou);
      }

      if (query) {
        conditions.push(`(shortname ILIKE $${paramIdx} OR fullname ILIKE $${paramIdx})`);
        params.push(`%${query}%`);
        paramIdx++;
      }

      if (status) {
        conditions.push(`n_stan = $${paramIdx++}`);
        params.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const dataQuery = `
        SELECT shortname, fullname, kod_edrpou, n_stan, d_open, d_close,
               num_lic, dt_lic, n_pr_lic, n_obl, np, adress, p_ind,
               telefon, website, name_e, shortname_en, glmfo, idnbu
        FROM nbu_banks
        ${whereClause}
        ORDER BY shortname
      `;
      const result = await this.db.query(dataQuery, params);

      return this.wrapResponse({
        source: 'Державний реєстр банків НБУ (bank.gov.ua)',
        total_found: result.rows.length,
        banks: result.rows.map((r: any) => ({
          name: r.shortname,
          full_name: r.fullname,
          name_en: r.shortname_en || null,
          edrpou: r.kod_edrpou,
          status: r.n_stan,
          opened: r.d_open,
          closed: r.d_close || null,
          license_number: r.num_lic,
          license_date: r.dt_lic,
          license_status: r.n_pr_lic,
          region: r.n_obl,
          city: r.np,
          address: r.adress,
          postal_code: r.p_ind,
          phone: r.telefon,
          website: r.website || null,
          glmfo: r.glmfo,
          nbu_id: r.idnbu,
        })),
      });
    } catch (error: any) {
      logger.error('[MCP Tool] search_nbu_banks failed', { error: error.message });
      return this.wrapError(`Помилка пошуку в реєстрі банків: ${error.message}`);
    }
  }
}
