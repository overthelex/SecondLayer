/**
 * TIER 1 Open Data Tools — MCP tools for newly imported data.gov.ua datasets
 *
 * 6 tools:
 * - search_invalid_passports — Перевірка недійсних паспортів (2.9M + 195K записів)
 * - search_vehicle_registrations — Реєстрація ТЗ та власники (19.5M записів)
 * - search_terrorism_list — Перелік осіб/організацій пов'язаних з тероризмом (ДСФМУ)
 * - search_lustration — Реєстр люстрованих осіб (587 записів)
 * - search_state_aid — Реєстр держдопомоги АМКУ (355 записів)
 * - search_financial_statements — Фінзвітність підприємств за ЄДРПОУ (504K записів)
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
        name: 'search_vehicle_registrations',
        annotations: { title: 'Реєстрація транспорту', readOnlyHint: true },
        description: `Пошук у реєстрі транспортних засобів та їх власників (МВС)

19.5M записів з 2013 року. Дані: VIN, держномер, марка, модель, рік, колір, тип, реєстраційні операції.
Пошук за VIN-кодом, держномером, маркою/моделлю.`,
        inputSchema: {
          type: 'object',
          properties: {
            vin: { type: 'string', description: 'VIN-код транспортного засобу' },
            n_reg_new: { type: 'string', description: 'Державний номерний знак' },
            brand: { type: 'string', description: 'Марка (TOYOTA, BMW тощо)' },
            model: { type: 'string', description: 'Модель' },
            make_year: { type: 'number', description: 'Рік випуску' },
            oper_name: { type: 'string', description: 'Тип операції (ПЕРЕРЕЄСТРАЦІЯ, ПЕРВИННА тощо)' },
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
            name: { type: 'string', description: 'Ім\'я або назва організації (укр. або англ.)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
          required: ['name'],
        },
      },
      {
        name: 'search_lustration',
        annotations: { title: 'Реєстр люстрації', readOnlyHint: true },
        description: `Пошук у реєстрі осіб, щодо яких застосовано Закон "Про очищення влади"

587 записів. Люстровані особи — заборона обіймати публічні посади.
Пошук за ПІБ або посадою.`,
        inputSchema: {
          type: 'object',
          properties: {
            fio: { type: 'string', description: 'ПІБ особи' },
            job: { type: 'string', description: 'Посада / місце роботи' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_state_aid',
        annotations: { title: 'Державна допомога', readOnlyHint: true },
        description: `Пошук у реєстрі державної допомоги (АМКУ)

Програми держдопомоги з надавачами та отримувачами. Пошук за назвою надавача, отримувача або програми.`,
        inputSchema: {
          type: 'object',
          properties: {
            provider_name: { type: 'string', description: 'Назва надавача допомоги' },
            recipient_name: { type: 'string', description: 'Назва отримувача допомоги' },
            program_name: { type: 'string', description: 'Назва програми допомоги' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_financial_statements',
        annotations: { title: 'Фінансова звітність', readOnlyHint: true },
        description: `Пошук фінансової звітності підприємств за ЄДРПОУ (Держстат)

504K XML-звітів. Баланси, звіти про фінрезультати (Форми 1-6) за ЄДРПОУ та рік.
Повертає метадані; для повного XML використовуйте параметр include_xml.`,
        inputSchema: {
          type: 'object',
          properties: {
            tin: { type: 'string', description: 'ЄДРПОУ / ІПН підприємства' },
            period_year: { type: 'number', description: 'Рік звітності (2021-2025)' },
            form_type: { type: 'string', description: 'Тип форми (S0100115 = Форма 1 тощо)' },
            include_xml: { type: 'boolean', default: false, description: 'Включити повний XML звіту' },
            limit: { type: 'number', default: 20, maximum: 50, description: 'Макс. результатів' },
          },
          required: ['tin'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    switch (name) {
      case 'search_invalid_passports': return this.searchInvalidPassports(args);
      case 'search_vehicle_registrations': return this.searchVehicleRegistrations(args);
      case 'search_terrorism_list': return this.searchTerrorismList(args);
      case 'search_lustration': return this.searchLustration(args);
      case 'search_state_aid': return this.searchStateAid(args);
      case 'search_financial_statements': return this.searchFinancialStatements(args);
      default: return null;
    }
  }

  // ─── Invalid Passports ──────────────────────────────────────────

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
      const sliced = results.slice(0, lim); return this.wrapResponse({ results: sliced, total_count: results.length, has_more: results.length > lim, limit: lim, offset: 0 });
    } catch (error: any) {
      logger.error('search_invalid_passports error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Vehicle Registrations ──────────────────────────────────────

  private async searchVehicleRegistrations(args: Record<string, unknown>): Promise<ToolResult> {
    const { vin, n_reg_new, brand, model, make_year, oper_name, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (vin) { conditions.push(`vin = $${pi}`); values.push(vin.toUpperCase()); pi++; }
    if (n_reg_new) { conditions.push(`n_reg_new ILIKE $${pi}`); values.push(`%${n_reg_new.toUpperCase()}%`); pi++; }
    if (brand) { conditions.push(`brand ILIKE $${pi}`); values.push(`%${brand.toUpperCase()}%`); pi++; }
    if (model) { conditions.push(`model ILIKE $${pi}`); values.push(`%${model.toUpperCase()}%`); pi++; }
    if (make_year) { conditions.push(`make_year = $${pi}`); values.push(Number(make_year)); pi++; }
    if (oper_name) { conditions.push(`oper_name ILIKE $${pi}`); values.push(`%${oper_name}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть VIN, держномер або марку для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT person_type, d_reg, oper_name, brand, model, vin, make_year,
        color, kind, body, purpose, fuel, capacity, n_reg_new, dep
      FROM opendata_vehicle_registrations
      WHERE ${conditions.join(' AND ')}
      ORDER BY d_reg DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Транспортних засобів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_vehicle_registrations error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Terrorism List ─────────────────────────────────────────────

  private async searchTerrorismList(args: Record<string, unknown>): Promise<ToolResult> {
    const { name, limit = 50 } = args as any;
    if (!name) return this.wrapResponse('Вкажіть ім\'я або назву для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);

    try {
      // Search persons
      const personsResult = await this.db.query(`
        SELECT 'person' as entity_type, name_ua, name_en, doc_type, sanctions_type, row_data
        FROM opendata_terrorism_persons
        WHERE name_ua ILIKE $1 OR name_en ILIKE $1
        LIMIT $2
      `, [`%${name}%`, lim]);

      // Search organizations
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

  // ─── Lustration ─────────────────────────────────────────────────

  private async searchLustration(args: Record<string, unknown>): Promise<ToolResult> {
    const { fio, job, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (fio) { conditions.push(`fio ILIKE $${pi}`); values.push(`%${fio}%`); pi++; }
    if (job) { conditions.push(`job ILIKE $${pi}`); values.push(`%${job}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ПІБ або посаду для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT fio, job, judgment, period
      FROM opendata_lustration
      WHERE ${conditions.join(' AND ')}
      ORDER BY fio LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Люстрованих осіб не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_lustration error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── State Aid ──────────────────────────────────────────────────

  private async searchStateAid(args: Record<string, unknown>): Promise<ToolResult> {
    const { provider_name, recipient_name, program_name, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (provider_name) { conditions.push(`provider_name ILIKE $${pi}`); values.push(`%${provider_name}%`); pi++; }
    if (recipient_name) { conditions.push(`recipient_name ILIKE $${pi}`); values.push(`%${recipient_name}%`); pi++; }
    if (program_name) { conditions.push(`program_name ILIKE $${pi}`); values.push(`%${program_name}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть надавача, отримувача або програму для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT provider_name, recipient_name, program_name, row_data
      FROM opendata_state_aid
      WHERE ${conditions.join(' AND ')}
      ORDER BY id DESC LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Записів держдопомоги не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_state_aid error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Financial Statements ───────────────────────────────────────

  private async searchFinancialStatements(args: Record<string, unknown>): Promise<ToolResult> {
    const { tin, period_year, form_type, include_xml = false, limit = 20 } = args as any;
    if (!tin) return this.wrapResponse('Вкажіть ЄДРПОУ / ІПН для пошуку');

    const conditions: string[] = ['tin = $1'];
    const values: any[] = [tin];
    let pi = 2;

    if (period_year) { conditions.push(`period_year = $${pi}`); values.push(Number(period_year)); pi++; }
    if (form_type) { conditions.push(`form_type ILIKE $${pi}`); values.push(`%${form_type}%`); pi++; }

    const xmlCol = include_xml ? ', raw_xml' : '';
    const lim = Math.min(Number(limit) || 20, 50);
    values.push(lim);
    const sql = `SELECT tin, c_doc, c_doc_sub, c_doc_ver, period_year, period_month,
        period_type, c_reg, c_raj, form_type${xmlCol}, COUNT(*) OVER() AS _total_count
      FROM opendata_financial_statements
      WHERE ${conditions.join(' AND ')}
      ORDER BY period_year DESC, form_type LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Фінансову звітність не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_financial_statements error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }
}
