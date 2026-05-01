/**
 * Open Data Registries Tools — MCP tools for large open data datasets
 *
 * 9 tools:
 * - search_public_organizations — Реєстр громадських формувань (1.08M записів)
 * - search_case_distribution — Автоматичний розподіл справ (71K записів)
 * - search_missing_persons — Реєстр зниклих безвісти (112K записів)
 * - search_securities_owners — Реєстр власників цінних паперів НКЦПФР (128K записів)
 * - search_wanted_persons — Реєстр розшукуваних осіб (71K записів)
 * - search_wanted_vehicles — Реєстр розшукуваних транспортних засобів (78K записів)
 * - search_judges — Реєстр суддів ВККС (417K історичних / 6K поточних)
 * - search_court_experts_registry — Атестовані судові експерти (80K записів)
 * - search_vat_payers_registry — Реєстр платників ПДВ (264K записів)
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
        name: 'search_public_organizations',
        annotations: { title: 'Реєстр громадських формувань', readOnlyHint: true },
        description: `Пошук у реєстрі громадських формувань (ГО, партії, профспілки, релігійні організації тощо)

1.08M записів. Пошук за назвою, ЄДРПОУ, типом реєстру, статусом, засновниками.`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Назва організації' },
            edrpou: { type: 'string', description: 'Код ЄДРПОУ' },
            registry_type: { type: 'string', description: 'Тип реєстру (ГО, партія, профспілка тощо)' },
            state: { type: 'string', description: 'Стан (зареєстровано, припинено тощо)' },
            founders: { type: 'string', description: 'Засновники (пошук за текстом)' },
            address: { type: 'string', description: 'Адреса' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_case_distribution',
        annotations: { title: 'Розподіл судових справ', readOnlyHint: true },
        description: `Пошук у протоколах автоматичного розподілу судових справ (ДСАУ)

71K записів. Пошук за номером справи, суддею, судом, учасниками, категорією справи.`,
        inputSchema: {
          type: 'object',
          properties: {
            cause_number: { type: 'string', description: 'Номер справи' },
            court_name: { type: 'string', description: 'Назва суду' },
            judges: { type: 'string', description: 'Прізвище судді' },
            presiding_judge: { type: 'string', description: 'Головуючий суддя' },
            participants: { type: 'string', description: 'Учасники справи' },
            case_category: { type: 'string', description: 'Категорія справи' },
            case_essence: { type: 'string', description: 'Суть справи (ключові слова)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_missing_persons',
        annotations: { title: 'Зниклі безвісти', readOnlyHint: true },
        description: `Пошук у реєстрі зниклих безвісти осіб (МВС)

112K записів. Пошук за прізвищем, ОВД, категорією, датою зникнення, місцем.`,
        inputSchema: {
          type: 'object',
          properties: {
            last_name: { type: 'string', description: 'Прізвище' },
            first_name: { type: 'string', description: 'Ім\'я' },
            ovd: { type: 'string', description: 'Орган внутрішніх справ' },
            category: { type: 'string', description: 'Категорія зниклого' },
            lost_place: { type: 'string', description: 'Місце зникнення' },
            sex: { type: 'string', description: 'Стать (чол/жін)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_securities_owners',
        annotations: { title: 'Власники цінних паперів', readOnlyHint: true },
        description: `Пошук власників істотної участі у цінних паперах (НКЦПФР)

128K записів. Пошук за емітентом, власником, ЄДРПОУ, ISIN-кодом, часткою.`,
        inputSchema: {
          type: 'object',
          properties: {
            issuer_name: { type: 'string', description: 'Назва емітента' },
            issuer_edrpou: { type: 'string', description: 'ЄДРПОУ емітента' },
            owner_name: { type: 'string', description: 'Назва / ім\'я власника' },
            owner_edrpou: { type: 'string', description: 'ЄДРПОУ власника' },
            isin_code: { type: 'string', description: 'Код ISIN цінного паперу' },
            min_share_percent: { type: 'number', description: 'Мінімальна частка участі (%)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_wanted_persons',
        annotations: { title: 'Розшукувані особи (МВС)', readOnlyHint: true },
        description: `Пошук у реєстрі розшукуваних осіб (МВС)

71K записів. Пошук за прізвищем, ОВД, статтею КК, категорією, запобіжним заходом.`,
        inputSchema: {
          type: 'object',
          properties: {
            last_name: { type: 'string', description: 'Прізвище' },
            first_name: { type: 'string', description: 'Ім\'я' },
            ovd: { type: 'string', description: 'Орган внутрішніх справ' },
            category: { type: 'string', description: 'Категорія розшуку' },
            article_crim: { type: 'string', description: 'Стаття Кримінального кодексу' },
            restraint: { type: 'string', description: 'Запобіжний захід' },
            sex: { type: 'string', description: 'Стать (чол/жін)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_wanted_vehicles',
        annotations: { title: 'Розшукувані транспортні засоби', readOnlyHint: true },
        description: `Пошук розшукуваних транспортних засобів (МВС)

78K записів. Пошук за маркою, номером, кольором, номером кузова/шасі/двигуна.`,
        inputSchema: {
          type: 'object',
          properties: {
            brand_model: { type: 'string', description: 'Марка та модель' },
            vehicle_number: { type: 'string', description: 'Державний номерний знак' },
            color: { type: 'string', description: 'Колір' },
            car_type: { type: 'string', description: 'Тип транспорту' },
            body_number: { type: 'string', description: 'Номер кузова' },
            chassis_number: { type: 'string', description: 'Номер шасі' },
            engine_number: { type: 'string', description: 'Номер двигуна' },
            organ_unit: { type: 'string', description: 'Орган, що розшукує' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_court_experts_registry',
        annotations: { title: 'Реєстр судових експертів', readOnlyHint: true },
        description: `Пошук атестованих судових експертів (Мін'юст)

80K записів. Пошук за прізвищем, установою, регіоном, типом експертизи, спеціалізацією.`,
        inputSchema: {
          type: 'object',
          properties: {
            surname: { type: 'string', description: 'Прізвище експерта' },
            first_name: { type: 'string', description: 'Ім\'я експерта' },
            org_name: { type: 'string', description: 'Назва установи' },
            region: { type: 'string', description: 'Регіон' },
            exp_type: { type: 'string', description: 'Тип експертизи' },
            specialization: { type: 'string', description: 'Спеціалізація' },
            license_num: { type: 'string', description: 'Номер свідоцтва' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_vat_payers_registry',
        annotations: { title: 'Реєстр платників ПДВ', readOnlyHint: true },
        description: `Пошук у реєстрі платників ПДВ (ДПС)

264K записів. Пошук за назвою або кодом ПДВ.`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Назва компанії або ФОП' },
            kod_pdv: { type: 'string', description: 'Код ПДВ' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
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
    switch (name) {
      case 'search_public_organizations': return this.searchPublicOrganizations(args);
      case 'search_case_distribution': return this.searchCaseDistribution(args);
      case 'search_missing_persons': return this.searchMissingPersons(args);
      case 'search_securities_owners': return this.searchSecuritiesOwners(args);
      case 'search_wanted_persons': return this.searchWantedPersons(args);
      case 'search_wanted_vehicles': return this.searchWantedVehicles(args);
      case 'search_court_experts_registry': return this.searchCourtExperts(args);
      case 'search_vat_payers_registry': return this.searchVatPayers(args);
      case 'search_judges': return this.searchJudges(args);
      default: return null;
    }
  }

  // ─── Public Organizations ──────────────────────────────────────────

  private async searchPublicOrganizations(args: Record<string, unknown>): Promise<ToolResult> {
    const { name, edrpou, registry_type, state, founders, address, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (name) { conditions.push(`name ILIKE $${pi}`); values.push(`%${name}%`); pi++; }
    if (edrpou) { conditions.push(`edrpou = $${pi}`); values.push(edrpou); pi++; }
    if (registry_type) { conditions.push(`registry_type ILIKE $${pi}`); values.push(`%${registry_type}%`); pi++; }
    if (state) { conditions.push(`state ILIKE $${pi}`); values.push(`%${state}%`); pi++; }
    if (founders) { conditions.push(`founders::text ILIKE $${pi}`); values.push(`%${founders}%`); pi++; }
    if (address) { conditions.push(`address ILIKE $${pi}`); values.push(`%${address}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву, ЄДРПОУ або тип реєстру для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT registry_type, reg_num, date_reg, name, edrpou, state, address, phone,
        founders, governing_body, kved, territory, obj_status, COUNT(*) OVER() AS _total_count
      FROM opendata_public_organizations
      WHERE ${conditions.join(' AND ')}
      ORDER BY date_reg DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Громадських формувань не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_public_organizations error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Case Distribution ─────────────────────────────────────────────

  private async searchCaseDistribution(args: Record<string, unknown>): Promise<ToolResult> {
    const { cause_number, court_name, judges, presiding_judge, participants, case_category, case_essence, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (cause_number) { conditions.push(`cause_number = $${pi}`); values.push(cause_number); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (judges) { conditions.push(`(judges ILIKE $${pi} OR participating_judges ILIKE $${pi} OR panel_judges ILIKE $${pi})`); values.push(`%${judges}%`); pi++; }
    if (presiding_judge) { conditions.push(`presiding_judge ILIKE $${pi}`); values.push(`%${presiding_judge}%`); pi++; }
    if (participants) { conditions.push(`participants ILIKE $${pi}`); values.push(`%${participants}%`); pi++; }
    if (case_category) { conditions.push(`case_category ILIKE $${pi}`); values.push(`%${case_category}%`); pi++; }
    if (case_essence) { conditions.push(`case_essence ILIKE $${pi}`); values.push(`%${case_essence}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть номер справи, суд або суддю для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT cause_number, court_name, case_category, case_complexity, case_essence,
        presiding_judge, panel_judges, participants, distribution_basis,
        distribution_start, distribution_end, excluded_judges, source_date
      FROM dsa_case_distribution
      WHERE ${conditions.join(' AND ')}
      ORDER BY distribution_start DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Протоколів розподілу не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_case_distribution error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Missing Persons ───────────────────────────────────────────────

  private async searchMissingPersons(args: Record<string, unknown>): Promise<ToolResult> {
    const { last_name, first_name, ovd, category, lost_place, sex, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (last_name) { conditions.push(`(last_name_u ILIKE $${pi} OR last_name_r ILIKE $${pi} OR last_name_e ILIKE $${pi})`); values.push(`%${last_name}%`); pi++; }
    if (first_name) { conditions.push(`(first_name_u ILIKE $${pi} OR first_name_r ILIKE $${pi} OR first_name_e ILIKE $${pi})`); values.push(`%${first_name}%`); pi++; }
    if (ovd) { conditions.push(`ovd ILIKE $${pi}`); values.push(`%${ovd}%`); pi++; }
    if (category) { conditions.push(`category ILIKE $${pi}`); values.push(`%${category}%`); pi++; }
    if (lost_place) { conditions.push(`lost_place ILIKE $${pi}`); values.push(`%${lost_place}%`); pi++; }
    if (sex) { conditions.push(`sex = $${pi}`); values.push(sex); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть прізвище, ОВД або місце зникнення для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT last_name_u, first_name_u, middle_name_u, birth_date, sex,
        ovd, category, lost_date, lost_place, article_crim, restraint, contact, COUNT(*) OVER() AS _total_count
      FROM opendata_missing_persons
      WHERE ${conditions.join(' AND ')}
      ORDER BY lost_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Зниклих безвісти не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_missing_persons error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Securities Owners ─────────────────────────────────────────────

  private async searchSecuritiesOwners(args: Record<string, unknown>): Promise<ToolResult> {
    const { issuer_name, issuer_edrpou, owner_name, owner_edrpou, isin_code, min_share_percent, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (issuer_name) { conditions.push(`issuer_name ILIKE $${pi}`); values.push(`%${issuer_name}%`); pi++; }
    if (issuer_edrpou) { conditions.push(`issuer_edrpou = $${pi}`); values.push(issuer_edrpou); pi++; }
    if (owner_name) { conditions.push(`(owner_name ILIKE $${pi} OR owner_name_alt ILIKE $${pi})`); values.push(`%${owner_name}%`); pi++; }
    if (owner_edrpou) { conditions.push(`owner_edrpou = $${pi}`); values.push(owner_edrpou); pi++; }
    if (isin_code) { conditions.push(`isin_code = $${pi}`); values.push(isin_code); pi++; }
    if (min_share_percent) { conditions.push(`share_percent >= $${pi}`); values.push(Number(min_share_percent)); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть емітента, власника або ISIN-код для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT report_date, issuer_edrpou, issuer_name, isin_code,
        owner_edrpou, owner_name, owner_name_alt, owner_type,
        share_percent, nominal_value, share_count, country_code, COUNT(*) OVER() AS _total_count
      FROM opendata_securities_owners
      WHERE ${conditions.join(' AND ')}
      ORDER BY share_percent DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Власників цінних паперів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_securities_owners error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Wanted Persons ────────────────────────────────────────────────

  private async searchWantedPersons(args: Record<string, unknown>): Promise<ToolResult> {
    const { last_name, first_name, ovd, category, article_crim, restraint, sex, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (last_name) { conditions.push(`(last_name_u ILIKE $${pi} OR last_name_r ILIKE $${pi} OR last_name_e ILIKE $${pi})`); values.push(`%${last_name}%`); pi++; }
    if (first_name) { conditions.push(`(first_name_u ILIKE $${pi} OR first_name_r ILIKE $${pi} OR first_name_e ILIKE $${pi})`); values.push(`%${first_name}%`); pi++; }
    if (ovd) { conditions.push(`ovd ILIKE $${pi}`); values.push(`%${ovd}%`); pi++; }
    if (category) { conditions.push(`category ILIKE $${pi}`); values.push(`%${category}%`); pi++; }
    if (article_crim) { conditions.push(`article_crim ILIKE $${pi}`); values.push(`%${article_crim}%`); pi++; }
    if (restraint) { conditions.push(`restraint ILIKE $${pi}`); values.push(`%${restraint}%`); pi++; }
    if (sex) { conditions.push(`sex = $${pi}`); values.push(sex); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть прізвище, ОВД або статтю КК для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT last_name_u, first_name_u, middle_name_u, birth_date, sex,
        ovd, category, lost_date, lost_place, article_crim, restraint, contact, COUNT(*) OVER() AS _total_count
      FROM opendata_wanted_persons
      WHERE ${conditions.join(' AND ')}
      ORDER BY lost_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Розшукуваних осіб не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_wanted_persons error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Wanted Vehicles ───────────────────────────────────────────────

  private async searchWantedVehicles(args: Record<string, unknown>): Promise<ToolResult> {
    const { brand_model, vehicle_number, color, car_type, body_number, chassis_number, engine_number, organ_unit, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (brand_model) { conditions.push(`brand_model ILIKE $${pi}`); values.push(`%${brand_model}%`); pi++; }
    if (vehicle_number) { conditions.push(`vehicle_number ILIKE $${pi}`); values.push(`%${vehicle_number}%`); pi++; }
    if (color) { conditions.push(`color ILIKE $${pi}`); values.push(`%${color}%`); pi++; }
    if (car_type) { conditions.push(`car_type ILIKE $${pi}`); values.push(`%${car_type}%`); pi++; }
    if (body_number) { conditions.push(`body_number = $${pi}`); values.push(body_number); pi++; }
    if (chassis_number) { conditions.push(`chassis_number = $${pi}`); values.push(chassis_number); pi++; }
    if (engine_number) { conditions.push(`engine_number = $${pi}`); values.push(engine_number); pi++; }
    if (organ_unit) { conditions.push(`organ_unit ILIKE $${pi}`); values.push(`%${organ_unit}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть марку, номер або колір для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT brand_model, car_type, color, vehicle_number, body_number,
        chassis_number, engine_number, illegal_seizure_date, organ_unit, insert_date, COUNT(*) OVER() AS _total_count
      FROM opendata_wanted_vehicles
      WHERE ${conditions.join(' AND ')}
      ORDER BY insert_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Розшукуваних транспортних засобів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_wanted_vehicles error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Court Experts ──────────────────────────────────────────────────

  private async searchCourtExperts(args: Record<string, unknown>): Promise<ToolResult> {
    const { surname, first_name, org_name, region, exp_type, specialization, license_num, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (surname) { conditions.push(`surname ILIKE $${pi}`); values.push(`%${surname}%`); pi++; }
    if (first_name) { conditions.push(`first_name ILIKE $${pi}`); values.push(`%${first_name}%`); pi++; }
    if (org_name) { conditions.push(`org_name ILIKE $${pi}`); values.push(`%${org_name}%`); pi++; }
    if (region) { conditions.push(`region ILIKE $${pi}`); values.push(`%${region}%`); pi++; }
    if (exp_type) { conditions.push(`exp_type ILIKE $${pi}`); values.push(`%${exp_type}%`); pi++; }
    if (specialization) { conditions.push(`specialization ILIKE $${pi}`); values.push(`%${specialization}%`); pi++; }
    if (license_num) { conditions.push(`license_num = $${pi}`); values.push(license_num); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть прізвище, установу або тип експертизи для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT surname, first_name, patronymic, org_name, region, phone,
        commission, license_num, valid_date, exp_type, specialization, COUNT(*) OVER() AS _total_count
      FROM opendata_court_experts
      WHERE ${conditions.join(' AND ')}
      ORDER BY surname, first_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Судових експертів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_court_experts_registry error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── VAT Payers ───────────────────────────────────────────────────

  private async searchVatPayers(args: Record<string, unknown>): Promise<ToolResult> {
    const { name, kod_pdv, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (name) { conditions.push(`name ILIKE $${pi}`); values.push(`%${name}%`); pi++; }
    if (kod_pdv) { conditions.push(`kod_pdv = $${pi}`); values.push(kod_pdv); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву або код ПДВ для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT name, kod_pdv, dat_reestr, dat_term, COUNT(*) OVER() AS _total_count
      FROM opendata_vat_payers
      WHERE ${conditions.join(' AND ')}
      ORDER BY dat_reestr DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Платників ПДВ не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_vat_payers_registry error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Judges ────────────────────────────────────────────────────────

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
