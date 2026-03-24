/**
 * Open Data Tools — MCP tools for open data registries on prod
 *
 * 6 tools:
 * - search_sanctions — OpenSanctions (1.25M entities, 346 datasets)
 * - search_trademarks — UIPV trademarks (182K records)
 * - search_patents — UIPV patents, utility models, designs (119K records)
 * - search_edrnpa — EDRNPA regulatory documents (141K cards + full texts)
 * - search_corruption_register — Єдиний реєстр корупціонерів (58K records)
 * - search_lawyers — Реєстр адвокатів (73K records)
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

export class OpenDataTools extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_sanctions',
        description: `Пошук у міжнародних санкційних списках (OpenSanctions, 346 датасетів)

Включає: РНБО, OFAC, EU, UN, UK та 340+ інших санкційних програм.
1.25M записів: фізичні особи, компанії, судна, літаки, криптогаманці.
Пошук за ім'ям, країною, датасетом, типом сутності.`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ім\'я або назва (нечіткий пошук)' },
            country: { type: 'string', description: 'Код країни (ua, ru, ir тощо)' },
            schema: { type: 'string', description: 'Тип: Person, Company, Organization, Vessel, Aircraft, CryptoWallet' },
            dataset: { type: 'string', description: 'Датасет (ua_nsdc_sanctions, us_ofac_sdn, eu_fsf тощо)' },
            identifier: { type: 'string', description: 'Ідентифікатор (ІПН, паспорт, ЄДРПОУ)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_trademarks',
        description: `Пошук торговельних марок (UIPV — Укрпатент)

182K записів. Пошук за текстом марки, власником, ЄДРПОУ, класом NICE, статусом.`,
        inputSchema: {
          type: 'object',
          properties: {
            mark_text: { type: 'string', description: 'Текст торговельної марки' },
            holder_name: { type: 'string', description: 'Назва або ім\'я власника' },
            holder_edrpou: { type: 'string', description: 'ЄДРПОУ власника' },
            nice_class: { type: 'number', description: 'Клас NICE (1-45)' },
            status: { type: 'string', description: 'Статус (зареєстровано, припинено тощо)' },
            registration_number: { type: 'string', description: 'Номер реєстрації' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_patents',
        description: `Пошук патентів, корисних моделей та промислових зразків (UIPV — Укрпатент)

119K записів. Пошук за назвою, власником, кодом МПК, номером заявки.`,
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Назва винаходу / корисної моделі' },
            owner_name: { type: 'string', description: 'Ім\'я або назва патентовласника' },
            ipc_code: { type: 'string', description: 'Код МПК (наприклад, A61K)' },
            app_number: { type: 'string', description: 'Номер заявки' },
            registration_number: { type: 'string', description: 'Номер патенту' },
            obj_type: { type: 'number', description: 'Тип: 1=винахід, 2=корисна модель, 3=промисл. зразок' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_edrnpa',
        description: `Пошук нормативно-правових актів у ЄДРНПА

141K записів. Пошук за назвою, номером, видавником, типом, ключовими словами.
Повертає метадані та повний текст документів.`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Назва або ключові слова акта' },
            number: { type: 'string', description: 'Номер акта' },
            publisher: { type: 'string', description: 'Видавник (орган)' },
            doc_type: { type: 'string', description: 'Тип документа (наказ, постанова, рішення)' },
            keywords: { type: 'string', description: 'Ключові слова' },
            include_text: { type: 'boolean', default: false, description: 'Включити повний текст (перші 3000 символів)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_corruption_register',
        description: `Пошук у Єдиному реєстрі осіб, які вчинили корупційні правопорушення

58K записів. Пошук за прізвищем, статтею КК, назвою суду, видом покарання.`,
        inputSchema: {
          type: 'object',
          properties: {
            last_name: { type: 'string', description: 'Прізвище' },
            first_name: { type: 'string', description: 'Ім\'я' },
            offense_name: { type: 'string', description: 'Назва правопорушення' },
            codex_articles: { type: 'string', description: 'Статті кодексу' },
            court_name: { type: 'string', description: 'Назва суду' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_lawyers',
        description: `Пошук у Єдиному реєстрі адвокатів України

73K записів. Пошук за прізвищем, радою адвокатів, статусом, номером свідоцтва.`,
        inputSchema: {
          type: 'object',
          properties: {
            last_name: { type: 'string', description: 'Прізвище адвоката' },
            first_name: { type: 'string', description: 'Ім\'я адвоката' },
            ra_name: { type: 'string', description: 'Назва ради адвокатів регіону' },
            status: { type: 'string', description: 'Статус (діє, зупинено, припинено)' },
            certificate_num: { type: 'string', description: 'Номер свідоцтва' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    switch (name) {
      case 'search_sanctions': return this.searchSanctions(args);
      case 'search_trademarks': return this.searchTrademarks(args);
      case 'search_patents': return this.searchPatents(args);
      case 'search_edrnpa': return this.searchEdrnpa(args);
      case 'search_corruption_register': return this.searchCorruption(args);
      case 'search_lawyers': return this.searchLawyers(args);
      default: return null;
    }
  }

  // ─── Sanctions ───────────────────────────────────────────────────────

  private async searchSanctions(args: Record<string, unknown>): Promise<ToolResult> {
    const { name, country, schema, dataset, identifier, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (name) {
      conditions.push(`name ILIKE $${pi}`);
      values.push(`%${name}%`);
      pi++;
    }
    if (country) {
      conditions.push(`countries ILIKE $${pi}`);
      values.push(`%${country}%`);
      pi++;
    }
    if (schema) {
      conditions.push(`schema = $${pi}`);
      values.push(schema);
      pi++;
    }
    if (dataset) {
      conditions.push(`datasets ILIKE $${pi}`);
      values.push(`%${dataset}%`);
      pi++;
    }
    if (identifier) {
      conditions.push(`identifiers ILIKE $${pi}`);
      values.push(`%${identifier}%`);
      pi++;
    }

    if (conditions.length === 0) {
      return this.wrapResponse('Вкажіть ім\'я, країну, датасет або ідентифікатор для пошуку');
    }

    values.push(Math.min(Number(limit) || 50, 100));

    const sql = `SELECT id, schema, name, aliases, birth_date, countries, identifiers, sanctions, datasets, first_seen, last_seen
      FROM opensanctions_entities
      WHERE ${conditions.join(' AND ')}
      ORDER BY last_seen DESC NULLS LAST
      LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Записів у санкційних списках не знайдено');
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_sanctions error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Trademarks ──────────────────────────────────────────────────────

  private async searchTrademarks(args: Record<string, unknown>): Promise<ToolResult> {
    const { mark_text, holder_name, holder_edrpou, nice_class, status, registration_number, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (mark_text) { conditions.push(`mark_text ILIKE $${pi}`); values.push(`%${mark_text}%`); pi++; }
    if (holder_name) { conditions.push(`(holder_name ILIKE $${pi} OR applicant_name ILIKE $${pi})`); values.push(`%${holder_name}%`); pi++; }
    if (holder_edrpou) { conditions.push(`(holder_edrpou = $${pi} OR applicant_edrpou = $${pi})`); values.push(holder_edrpou); pi++; }
    if (nice_class) { conditions.push(`$${pi} = ANY(nice_classes)`); values.push(Number(nice_class)); pi++; }
    if (status) { conditions.push(`status ILIKE $${pi}`); values.push(`%${status}%`); pi++; }
    if (registration_number) { conditions.push(`registration_number = $${pi}`); values.push(registration_number); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть текст марки, власника або ЄДРПОУ для пошуку');

    values.push(Math.min(Number(limit) || 50, 100));
    const sql = `SELECT app_number, app_date, registration_number, registration_date, expiry_date,
        mark_text, holder_name, holder_edrpou, holder_country, nice_classes, status
      FROM opendata_trademarks WHERE ${conditions.join(' AND ')}
      ORDER BY registration_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Торговельних марок не знайдено');
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_trademarks error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Patents ─────────────────────────────────────────────────────────

  private async searchPatents(args: Record<string, unknown>): Promise<ToolResult> {
    const { title, owner_name, ipc_code, app_number, registration_number, obj_type, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (title) { conditions.push(`(title_ua ILIKE $${pi} OR title_en ILIKE $${pi})`); values.push(`%${title}%`); pi++; }
    if (owner_name) { conditions.push(`owner_name ILIKE $${pi}`); values.push(`%${owner_name}%`); pi++; }
    if (ipc_code) { conditions.push(`$${pi} = ANY(ipc_codes)`); values.push(ipc_code); pi++; }
    if (app_number) { conditions.push(`app_number = $${pi}`); values.push(app_number); pi++; }
    if (registration_number) { conditions.push(`registration_number = $${pi}`); values.push(registration_number); pi++; }
    if (obj_type) { conditions.push(`obj_type = $${pi}`); values.push(Number(obj_type)); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву, власника або код МПК для пошуку');

    values.push(Math.min(Number(limit) || 50, 100));
    const sql = `SELECT app_number, app_date, registration_number, registration_date,
        obj_type_name, title_ua, title_en, abstract_ua, ipc_codes, owner_name, owner_country, status
      FROM opendata_patents WHERE ${conditions.join(' AND ')}
      ORDER BY registration_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Патентів не знайдено');
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_patents error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── EDRNPA ──────────────────────────────────────────────────────────

  private async searchEdrnpa(args: Record<string, unknown>): Promise<ToolResult> {
    const { name, number, publisher, doc_type, keywords, include_text = false, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (name) { conditions.push(`c.name ILIKE $${pi}`); values.push(`%${name}%`); pi++; }
    if (number) { conditions.push(`c.number = $${pi}`); values.push(number); pi++; }
    if (publisher) { conditions.push(`c.publisher ILIKE $${pi}`); values.push(`%${publisher}%`); pi++; }
    if (doc_type) { conditions.push(`c.doc_type ILIKE $${pi}`); values.push(`%${doc_type}%`); pi++; }
    if (keywords) { conditions.push(`c.keywords ILIKE $${pi}`); values.push(`%${keywords}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву, номер або видавника для пошуку');

    values.push(Math.min(Number(limit) || 50, 100));

    const textJoin = include_text
      ? `LEFT JOIN opendata_edrnpa_texts t ON t.id = c.id`
      : '';
    const textCol = include_text
      ? `, LEFT(t.full_text, 3000) AS full_text`
      : '';

    const sql = `SELECT c.id, c.publisher, c.doc_type, c.date_acc, c.number, c.name, c.status, c.reestr_date, c.keywords${textCol}
      FROM opendata_edrnpa_cards c ${textJoin}
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.reestr_date DESC NULLS LAST
      LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Нормативних актів не знайдено');
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_edrnpa error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Corruption Register ─────────────────────────────────────────────

  private async searchCorruption(args: Record<string, unknown>): Promise<ToolResult> {
    const { last_name, first_name, offense_name, codex_articles, court_name, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (last_name) { conditions.push(`last_name ILIKE $${pi}`); values.push(`%${last_name}%`); pi++; }
    if (first_name) { conditions.push(`first_name ILIKE $${pi}`); values.push(`%${first_name}%`); pi++; }
    if (offense_name) { conditions.push(`offense_name ILIKE $${pi}`); values.push(`%${offense_name}%`); pi++; }
    if (codex_articles) { conditions.push(`codex_articles ILIKE $${pi}`); values.push(`%${codex_articles}%`); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть прізвище, статтю або суд для пошуку');

    values.push(Math.min(Number(limit) || 50, 100));
    const sql = `SELECT last_name, first_name, patronymic, entity_type, offense_name,
        punishment_type, punishment, codex_articles, court_case_number, sentence_date, court_name
      FROM opendata_corruption WHERE ${conditions.join(' AND ')}
      ORDER BY sentence_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Записів у реєстрі корупціонерів не знайдено');
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_corruption_register error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Lawyers ─────────────────────────────────────────────────────────

  private async searchLawyers(args: Record<string, unknown>): Promise<ToolResult> {
    const { last_name, first_name, ra_name, status, certificate_num, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (last_name) { conditions.push(`last_name ILIKE $${pi}`); values.push(`%${last_name}%`); pi++; }
    if (first_name) { conditions.push(`first_name ILIKE $${pi}`); values.push(`%${first_name}%`); pi++; }
    if (ra_name) { conditions.push(`ra_name ILIKE $${pi}`); values.push(`%${ra_name}%`); pi++; }
    if (status) { conditions.push(`status ILIKE $${pi}`); values.push(`%${status}%`); pi++; }
    if (certificate_num) { conditions.push(`certificate_num = $${pi}`); values.push(certificate_num); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть прізвище, раду або номер свідоцтва для пошуку');

    values.push(Math.min(Number(limit) || 50, 100));
    const sql = `SELECT lawyer_id, last_name, first_name, patronymic, ra_name,
        certificate_num, certificate_date, decision_num, decision_date,
        authority_name, email, status, status_description, work_address, org_forms
      FROM opendata_lawyers WHERE ${conditions.join(' AND ')}
      ORDER BY last_name, first_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Адвокатів не знайдено');
      return this.wrapResponse(JSON.stringify(result.rows, null, 2));
    } catch (error: any) {
      logger.error('search_lawyers error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }
}
