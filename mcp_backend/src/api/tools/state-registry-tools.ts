/**
 * State Registry Tools - ERB (Єдиний реєстр боржників) + NBU bank registry
 *
 * 2 tools:
 * - search_erb_debtors — пошук у Єдиному реєстрі боржників (Мін'юст)
 * - search_nbu_banks — пошук банків з ліцензією НБУ
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
        name: 'search_erb_debtors',
        description: `Пошук у Єдиному реєстрі боржників (Міністерство юстиції України)

Реєстр містить 10+ млн записів про боржників з відкритими виконавчими провадженнями.
Пошук за кодом ЄДРПОУ, ПІБ боржника або номером виконавчого провадження.
Джерело: data.gov.ua / erb.minjust.gov.ua`,
        inputSchema: {
          type: 'object',
          properties: {
            debtor_name: {
              type: 'string',
              description: 'ПІБ фізичної особи або назва юридичної особи (пошук по вхожденню)',
            },
            debtor_code: {
              type: 'string',
              description: 'Код ЄДРПОУ юридичної особи',
            },
            vp_ordernum: {
              type: 'string',
              description: 'Номер виконавчого провадження',
            },
            vd_cat: {
              type: 'string',
              description: 'Категорія стягнення (наприклад: "стягнення коштів", "аліменти")',
            },
            limit: {
              type: 'number',
              default: 20,
              maximum: 100,
              description: 'Максимальна кількість результатів (за замовчуванням 20)',
            },
          },
          required: [],
        },
      },
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
      case 'search_erb_debtors':
        return await this.searchErbDebtors(args);
      case 'search_nbu_banks':
        return await this.searchNbuBanks(args);
      default:
        return null;
    }
  }

  private async searchErbDebtors(args: any): Promise<ToolResult> {
    const debtorName = args.debtor_name?.trim();
    const debtorCode = args.debtor_code?.trim();
    const vpOrdernum = args.vp_ordernum?.trim();
    const vdCat = args.vd_cat?.trim();
    const limit = Math.min(Number(args.limit) || 20, 100);

    if (!debtorName && !debtorCode && !vpOrdernum) {
      return this.wrapError('Потрібно вказати хоча б один параметр: debtor_name, debtor_code або vp_ordernum');
    }

    logger.info('[MCP Tool] search_erb_debtors', { debtorName, debtorCode, vpOrdernum, limit });

    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (debtorCode) {
        conditions.push(`debtor_code = $${paramIdx++}`);
        params.push(debtorCode);
      }

      if (vpOrdernum) {
        conditions.push(`vp_ordernum = $${paramIdx++}`);
        params.push(vpOrdernum);
      }

      if (debtorName) {
        conditions.push(`debtor_name ILIKE $${paramIdx++}`);
        params.push(`%${debtorName}%`);
      }

      if (vdCat) {
        conditions.push(`vd_cat ILIKE $${paramIdx++}`);
        params.push(`%${vdCat}%`);
      }

      const countQuery = `SELECT count(*) AS total FROM erb_debtors WHERE ${conditions.join(' AND ')}`;
      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total, 10);

      params.push(limit);
      const dataQuery = `
        SELECT debtor_name, debtor_birthdate, debtor_code, publisher, org_name,
               org_phone_num, emp_full_fio, emp_phone_num, email_addr, vp_ordernum, vd_cat
        FROM erb_debtors
        WHERE ${conditions.join(' AND ')}
        ORDER BY id DESC
        LIMIT $${paramIdx}
      `;
      const result = await this.db.query(dataQuery, params);

      return this.wrapResponse({
        source: 'Єдиний реєстр боржників (Мін\'юст, data.gov.ua)',
        total_found: total,
        returned: result.rows.length,
        limit,
        debtors: result.rows.map((r: any) => ({
          debtor_name: r.debtor_name,
          debtor_birthdate: r.debtor_birthdate || null,
          debtor_code: r.debtor_code || null,
          publisher: r.publisher,
          org_name: r.org_name,
          org_phone: r.org_phone_num || null,
          executor: r.emp_full_fio || null,
          executor_phone: r.emp_phone_num || null,
          executor_email: r.email_addr || null,
          vp_number: r.vp_ordernum,
          category: r.vd_cat,
        })),
      });
    } catch (error: any) {
      logger.error('[MCP Tool] search_erb_debtors failed', { error: error.message });
      return this.wrapError(`Помилка пошуку в реєстрі боржників: ${error.message}`);
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
