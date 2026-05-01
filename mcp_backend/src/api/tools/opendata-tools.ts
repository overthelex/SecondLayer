/**
 * Open Data Tools — MCP tools for open data registries on prod
 *
 * 12 tools:
 * - search_sanctions — OpenSanctions (1.25M entities, 346 datasets)
 * - search_trademarks — UIPV trademarks (182K records)
 * - search_patents — UIPV patents, utility models, designs (119K records)
 * - search_edrnpa — EDRNPA regulatory documents (141K cards + full texts)
 * - search_corruption_register — Єдиний реєстр корупціонерів (58K records)
 * - search_lawyers — Реєстр адвокатів (73K records)
 * - search_vrp_decisions — Рішення ВРП (16.5K records)
 * - search_vrp_judges_discipline — Звільнені/відсторонені судді та втручання (738 records)
 * - search_vkks — ВККС: судді, оцінювання, декларації, вакансії, ефективність (24.6K records)
 * - search_declaration_checks — Перевірки декларацій (2K records)
 * - search_wage_debtors — Боржники із зарплати (1.3K records)
 * - search_large_taxpayers — Великі платники податків (1.3K records)
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
        annotations: { title: 'Санкційні списки', readOnlyHint: true, openWorldHint: true },
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
        annotations: { title: 'Торговельні марки (Укрпатент)', readOnlyHint: true },
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
        annotations: { title: 'Патенти (Укрпатент)', readOnlyHint: true },
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
        annotations: { title: 'НПА (ЄДРНПА)', readOnlyHint: true },
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
        annotations: { title: 'Реєстр корупціонерів', readOnlyHint: true },
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
        annotations: { title: 'Реєстр адвокатів', readOnlyHint: true },
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
      {
        name: 'search_vrp_decisions',
        annotations: { title: 'Рішення ВРП', readOnlyHint: true },
        description: `Пошук рішень Вищої ради правосуддя (ВРП)

16.5K записів. Пошук за назвою, органом, номером рішення, датою.
Включає голосування та тексти рішень.`,
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Назва рішення (нечіткий пошук)' },
            authority: { type: 'string', description: 'Орган (наприклад, Пленум ВРП, Дисциплінарна палата)' },
            decision_num: { type: 'string', description: 'Номер рішення' },
            date_from: { type: 'string', description: 'Дата від (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'Дата до (YYYY-MM-DD)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_vrp_judges_discipline',
        annotations: { title: 'Дисциплінарні дані суддів (ВРП)', readOnlyHint: true },
        description: `Пошук дисциплінарних даних суддів з ВРП

Об'єднаний пошук по 3 реєстрах:
- Звільнені судді (59 записів)
- Відсторонені судді (236 записів)
- Повідомлення про втручання (443 записів)
Пошук за ПІБ судді, назвою суду, типом запису.`,
        inputSchema: {
          type: 'object',
          properties: {
            judge_name: { type: 'string', description: 'ПІБ судді (нечіткий пошук)' },
            court_name: { type: 'string', description: 'Назва суду (нечіткий пошук)' },
            type: { type: 'string', enum: ['dismissed', 'suspended', 'interference'], description: 'Тип: dismissed (звільнені), suspended (відсторонені), interference (втручання). Без фільтра — всі типи' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_vkks',
        annotations: { title: 'Дані ВККС', readOnlyHint: true },
        description: `Пошук даних Вищої кваліфікаційної комісії суддів (ВККС)

5 категорій:
- judges — досьє суддів (4.7K записів)
- evaluations — оцінювання суддів (3.4K записів)
- declarations — декларації суддів (4.8K записів)
- vacancies — вакансії у судах (1K записів)
- efficiency — ефективність суддів (10.7K записів)

Обов'язковий параметр: category.`,
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['judges', 'evaluations', 'declarations', 'vacancies', 'efficiency'], description: 'Категорія даних ВККС (обов\'язково)' },
            judge_name: { type: 'string', description: 'ПІБ судді (для judges, evaluations, declarations, efficiency)' },
            court_name: { type: 'string', description: 'Назва суду' },
            year: { type: 'number', description: 'Рік (для declarations, efficiency)' },
            region: { type: 'string', description: 'Регіон (для vacancies)' },
            court_level: { type: 'string', description: 'Рівень суду (для vacancies, efficiency)' },
            dossier_number: { type: 'string', description: 'Номер досьє (для judges, evaluations)' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
          required: ['category'],
        },
      },
      {
        name: 'search_declaration_checks',
        annotations: { title: 'Перевірки декларацій (НАЗК)', readOnlyHint: true },
        description: `Пошук результатів перевірок декларацій (НАЗК)

2K записів. Пошук за прізвищем, посадою, статусом перевірки, результатом.`,
        inputSchema: {
          type: 'object',
          properties: {
            family_name: { type: 'string', description: 'Прізвище декларанта' },
            name: { type: 'string', description: 'Ім\'я декларанта' },
            position: { type: 'string', description: 'Посада' },
            status: { type: 'string', description: 'Статус перевірки' },
            result: { type: 'string', description: 'Результат перевірки' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_wage_debtors',
        annotations: { title: 'Боржники із зарплати', readOnlyHint: true },
        description: `Пошук боржників із заробітної плати

1.3K записів. Пошук за назвою підприємства, регіоном, формою власності, видом діяльності.`,
        inputSchema: {
          type: 'object',
          properties: {
            company_name: { type: 'string', description: 'Назва підприємства' },
            region: { type: 'string', description: 'Регіон' },
            ownership_form: { type: 'string', description: 'Форма власності' },
            economic_activity: { type: 'string', description: 'Вид економічної діяльності' },
            limit: { type: 'number', default: 50, maximum: 100, description: 'Макс. результатів' },
          },
        },
      },
      {
        name: 'search_large_taxpayers',
        annotations: { title: 'Великі платники податків', readOnlyHint: true },
        description: `Пошук у реєстрі великих платників податків

1.3K записів. Пошук за ЄДРПОУ або назвою підприємства.`,
        inputSchema: {
          type: 'object',
          properties: {
            edrpou: { type: 'string', description: 'Код ЄДРПОУ' },
            name: { type: 'string', description: 'Назва підприємства' },
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
      case 'search_vrp_decisions': return this.searchVrpDecisions(args);
      case 'search_vrp_judges_discipline': return this.searchVrpJudgesDiscipline(args);
      case 'search_vkks': return this.searchVkks(args);
      case 'search_declaration_checks': return this.searchDeclarationChecks(args);
      case 'search_wage_debtors': return this.searchWageDebtors(args);
      case 'search_large_taxpayers': return this.searchLargeTaxpayers(args);
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

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);

    const sql = `SELECT id, schema, name, aliases, birth_date, countries, identifiers, sanctions, datasets, first_seen, last_seen, COUNT(*) OVER() AS _total_count
      FROM opensanctions_entities
      WHERE ${conditions.join(' AND ')}
      ORDER BY last_seen DESC NULLS LAST
      LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Записів у санкційних списках не знайдено');
      return this.wrapSearchResults(result.rows, lim);
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

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT app_number, app_date, registration_number, registration_date, expiry_date,
        mark_text, holder_name, holder_edrpou, holder_country, nice_classes, status, COUNT(*) OVER() AS _total_count
      FROM opendata_trademarks WHERE ${conditions.join(' AND ')}
      ORDER BY registration_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Торговельних марок не знайдено');
      return this.wrapSearchResults(result.rows, lim);
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

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT app_number, app_date, registration_number, registration_date,
        obj_type_name, title_ua, title_en, abstract_ua, ipc_codes, owner_name, owner_country, status
      FROM opendata_patents WHERE ${conditions.join(' AND ')}
      ORDER BY registration_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Патентів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
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

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);

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
      return this.wrapSearchResults(result.rows, lim);
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

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT last_name, first_name, patronymic, entity_type, offense_name,
        punishment_type, punishment, codex_articles, court_case_number, sentence_date, court_name
      FROM opendata_corruption WHERE ${conditions.join(' AND ')}
      ORDER BY sentence_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Записів у реєстрі корупціонерів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
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

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT lawyer_id, last_name, first_name, patronymic, ra_name,
        certificate_num, certificate_date, decision_num, decision_date,
        authority_name, email, status, status_description, work_address, org_forms
      FROM opendata_lawyers WHERE ${conditions.join(' AND ')}
      ORDER BY last_name, first_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Адвокатів не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_lawyers error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── VRP Decisions ──────────────────────────────────────────────────

  private async searchVrpDecisions(args: Record<string, unknown>): Promise<ToolResult> {
    const { title, authority, decision_num, date_from, date_to, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (title) { conditions.push(`title ILIKE $${pi}`); values.push(`%${title}%`); pi++; }
    if (authority) { conditions.push(`authority = $${pi}`); values.push(authority); pi++; }
    if (decision_num) { conditions.push(`decision_num = $${pi}`); values.push(decision_num); pi++; }
    if (date_from) { conditions.push(`date_time >= $${pi}`); values.push(date_from); pi++; }
    if (date_to) { conditions.push(`date_time <= $${pi}`); values.push(date_to); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву, орган, номер або дату для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT id, date_time, authority, title, decision_num, proceeding_ids,
        voting_title, voting_for, voting_against, voting_type, voting_result, texts, COUNT(*) OVER() AS _total_count
      FROM vrp_decisions WHERE ${conditions.join(' AND ')}
      ORDER BY date_time DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Рішень ВРП не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_vrp_decisions error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── VRP Judges Discipline ──────────────────────────────────────────

  private async searchVrpJudgesDiscipline(args: Record<string, unknown>): Promise<ToolResult> {
    const { judge_name, court_name, type, limit = 50 } = args as any;
    const maxRows = Math.min(Number(limit) || 50, 100);
    const queries: string[] = [];
    const allValues: any[][] = [];

    const types = type ? [type] : ['dismissed', 'suspended', 'interference'];

    for (const t of types) {
      const conditions: string[] = [];
      const values: any[] = [];
      let pi = 1;

      if (judge_name) { conditions.push(`judge_name ILIKE $${pi}`); values.push(`%${judge_name}%`); pi++; }
      if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      values.push(maxRows);

      if (t === 'dismissed') {
        queries.push(`SELECT 'dismissed' AS type, judge_name, court_name, applicant, reporter,
            panel_decision_date, panel_decision_num, vrp_decision_date_num, NULL AS suspension_reason,
            NULL AS suspension_deadline, NULL AS suspension_body, NULL AS received_date,
            NULL AS case_num, NULL AS check_result, NULL AS reaction
          FROM vrp_dismissed_judges ${where}
          ORDER BY panel_decision_date DESC NULLS LAST LIMIT $${pi}`);
      } else if (t === 'suspended') {
        queries.push(`SELECT 'suspended' AS type, judge_name, court_name, applicant, reporter,
            decision_date AS panel_decision_date, decision_num AS panel_decision_num,
            NULL AS vrp_decision_date_num, suspension_reason, suspension_deadline, suspension_body,
            NULL AS received_date, NULL AS case_num, NULL AS check_result, NULL AS reaction
          FROM vrp_suspended_judges ${where}
          ORDER BY decision_date DESC NULLS LAST LIMIT $${pi}`);
      } else if (t === 'interference') {
        queries.push(`SELECT 'interference' AS type, judge_name, court_name, applicant, reporter,
            NULL AS panel_decision_date, NULL AS panel_decision_num, NULL AS vrp_decision_date_num,
            NULL AS suspension_reason, NULL AS suspension_deadline, NULL AS suspension_body,
            received_date, case_num, check_result, reaction
          FROM vrp_interference_reports ${where}
          ORDER BY received_date DESC NULLS LAST LIMIT $${pi}`);
      }
      allValues.push(values);
    }

    if (queries.length === 0) return this.wrapResponse('Невідомий тип запису');

    try {
      const allRows: any[] = [];
      for (let i = 0; i < queries.length; i++) {
        const result = await this.db.query(queries[i], allValues[i]);
        allRows.push(...result.rows);
      }

      if (allRows.length === 0) return this.wrapResponse('Дисциплінарних записів не знайдено');
      const sliced = allRows.slice(0, maxRows);
      return this.wrapResponse({
        results: sliced,
        total_count: allRows.length,
        has_more: allRows.length > maxRows,
        limit: maxRows,
        offset: 0,
      });
    } catch (error: any) {
      logger.error('search_vrp_judges_discipline error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── VKKS ──────────────────────────────────────────────────────────

  private async searchVkks(args: Record<string, unknown>): Promise<ToolResult> {
    const { category, judge_name, court_name, year, region, court_level, dossier_number, limit = 50 } = args as any;

    if (!category) return this.wrapResponse('Вкажіть category: judges, evaluations, declarations, vacancies, efficiency');

    const maxRows = Math.min(Number(limit) || 50, 100);

    switch (category) {
      case 'judges': return this.searchVkksJudges({ judge_name, court_name, dossier_number, limit: maxRows });
      case 'evaluations': return this.searchVkksEvaluations({ judge_name, court_name, dossier_number, limit: maxRows });
      case 'declarations': return this.searchVkksDeclarations({ judge_name, court_name, year, limit: maxRows });
      case 'vacancies': return this.searchVkksVacancies({ court_name, region, court_level, limit: maxRows });
      case 'efficiency': return this.searchVkksEfficiency({ judge_name, court_name, court_level, year, limit: maxRows });
      default: return this.wrapResponse('Невідома категорія. Доступні: judges, evaluations, declarations, vacancies, efficiency');
    }
  }

  private async searchVkksJudges(args: any): Promise<ToolResult> {
    const { judge_name, court_name, dossier_number, limit } = args;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (judge_name) { conditions.push(`full_name ILIKE $${pi}`); values.push(`%${judge_name}%`); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (dossier_number) { conditions.push(`dossier_number = $${pi}`); values.push(dossier_number); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ПІБ судді, суд або номер досьє');

    values.push(limit);
    const sql = `SELECT id, dossier_number, full_name, gender, court_name, source_date, COUNT(*) OVER() AS _total_count
      FROM vkks_judges WHERE ${conditions.join(' AND ')}
      ORDER BY full_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Суддів у ВККС не знайдено');
      return this.wrapSearchResults(result.rows, limit);
    } catch (error: any) {
      logger.error('search_vkks_judges error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private async searchVkksEvaluations(args: any): Promise<ToolResult> {
    const { judge_name, court_name, dossier_number, limit } = args;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (judge_name) { conditions.push(`judge_name ILIKE $${pi}`); values.push(`%${judge_name}%`); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (dossier_number) { conditions.push(`dossier_number = $${pi}`); values.push(dossier_number); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ПІБ судді, суд або номер досьє');

    values.push(limit);
    const sql = `SELECT id, dossier_number, judge_name, court_name, collegium_decision_date,
        collegium_decision_number, total_score, collegium_decision_essence, plenary_decision_date,
        plenary_decision_number, plenary_decision_essence, evaluation_type, decision_url, notes, COUNT(*) OVER() AS _total_count
      FROM vkks_evaluations WHERE ${conditions.join(' AND ')}
      ORDER BY collegium_decision_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Оцінювань суддів не знайдено');
      return this.wrapSearchResults(result.rows, limit);
    } catch (error: any) {
      logger.error('search_vkks_evaluations error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private async searchVkksDeclarations(args: any): Promise<ToolResult> {
    const { judge_name, court_name, year, limit } = args;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (judge_name) { conditions.push(`judge_name ILIKE $${pi}`); values.push(`%${judge_name}%`); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (year) { conditions.push(`year = $${pi}`); values.push(Number(year)); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ПІБ судді, суд або рік');

    values.push(limit);
    const sql = `SELECT id, judge_name, court_name, declaration_type, year, source, COUNT(*) OVER() AS _total_count
      FROM vkks_declarations WHERE ${conditions.join(' AND ')}
      ORDER BY year DESC, judge_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Декларацій суддів не знайдено');
      return this.wrapSearchResults(result.rows, limit);
    } catch (error: any) {
      logger.error('search_vkks_declarations error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private async searchVkksVacancies(args: any): Promise<ToolResult> {
    const { court_name, region, court_level, limit } = args;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (region) { conditions.push(`region ILIKE $${pi}`); values.push(`%${region}%`); pi++; }
    if (court_level) { conditions.push(`court_level ILIKE $${pi}`); values.push(`%${court_level}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву суду, регіон або рівень суду');

    values.push(limit);
    const sql = `SELECT id, court_name, court_level, region, positions_limit, positions_filled,
        positions_vacant, positions_in_process, report_date, COUNT(*) OVER() AS _total_count
      FROM vkks_vacancies WHERE ${conditions.join(' AND ')}
      ORDER BY report_date DESC NULLS LAST LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Вакансій у судах не знайдено');
      return this.wrapSearchResults(result.rows, limit);
    } catch (error: any) {
      logger.error('search_vkks_vacancies error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private async searchVkksEfficiency(args: any): Promise<ToolResult> {
    const { judge_name, court_name, court_level, year, limit } = args;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (judge_name) { conditions.push(`judge_name ILIKE $${pi}`); values.push(`%${judge_name}%`); pi++; }
    if (court_name) { conditions.push(`court_name ILIKE $${pi}`); values.push(`%${court_name}%`); pi++; }
    if (court_level) { conditions.push(`court_level ILIKE $${pi}`); values.push(`%${court_level}%`); pi++; }
    if (year) { conditions.push(`year = $${pi}`); values.push(Number(year)); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ПІБ судді, суд, рівень або рік');

    values.push(limit);
    const sql = `SELECT id, judge_name, court_name, court_level, year,
        workload_total_judge, workload_total_court, workload_total_region,
        workload_criminal_judge, workload_civil_judge, workload_admin_judge,
        workload_commercial_judge, workload_offense_judge,
        annulled_total, changed_total, overdue_cases_total, COUNT(*) OVER() AS _total_count
      FROM vkks_judge_efficiency WHERE ${conditions.join(' AND ')}
      ORDER BY year DESC, judge_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Даних про ефективність суддів не знайдено');
      return this.wrapSearchResults(result.rows, limit);
    } catch (error: any) {
      logger.error('search_vkks_efficiency error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Declaration Checks ─────────────────────────────────────────────

  private async searchDeclarationChecks(args: Record<string, unknown>): Promise<ToolResult> {
    const { family_name, name, position, status, result: checkResult, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (family_name) { conditions.push(`family_name ILIKE $${pi}`); values.push(`%${family_name}%`); pi++; }
    if (name) { conditions.push(`name ILIKE $${pi}`); values.push(`%${name}%`); pi++; }
    if (position) { conditions.push(`position ILIKE $${pi}`); values.push(`%${position}%`); pi++; }
    if (status) { conditions.push(`status ILIKE $${pi}`); values.push(`%${status}%`); pi++; }
    if (checkResult) { conditions.push(`result ILIKE $${pi}`); values.push(`%${checkResult}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть прізвище, посаду або статус для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT id, declaration_uid, family_name, name, additional_name, position,
        position_category, reporting_period, status, result, result_url, measures, completion_year
      FROM opendata_declaration_checks WHERE ${conditions.join(' AND ')}
      ORDER BY family_name, name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Перевірок декларацій не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_declaration_checks error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Wage Debtors ───────────────────────────────────────────────────

  private async searchWageDebtors(args: Record<string, unknown>): Promise<ToolResult> {
    const { company_name, region, ownership_form, economic_activity, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (company_name) { conditions.push(`company_name ILIKE $${pi}`); values.push(`%${company_name}%`); pi++; }
    if (region) { conditions.push(`region ILIKE $${pi}`); values.push(`%${region}%`); pi++; }
    if (ownership_form) { conditions.push(`ownership_form ILIKE $${pi}`); values.push(`%${ownership_form}%`); pi++; }
    if (economic_activity) { conditions.push(`economic_activity ILIKE $${pi}`); values.push(`%${economic_activity}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть назву, регіон або вид діяльності для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT id, region, company_name, ownership_form, economic_activity,
        debt_2018_01, debt_2019_01, debt_2019_02_25, debt_reason
      FROM opendata_wage_debtors WHERE ${conditions.join(' AND ')}
      ORDER BY company_name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Боржників із зарплати не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_wage_debtors error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  // ─── Large Taxpayers ────────────────────────────────────────────────

  private async searchLargeTaxpayers(args: Record<string, unknown>): Promise<ToolResult> {
    const { edrpou, name, limit = 50 } = args as any;
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (edrpou) { conditions.push(`edrpou = $${pi}`); values.push(edrpou); pi++; }
    if (name) { conditions.push(`name ILIKE $${pi}`); values.push(`%${name}%`); pi++; }

    if (conditions.length === 0) return this.wrapResponse('Вкажіть ЄДРПОУ або назву для пошуку');

    const lim = Math.min(Number(limit) || 50, 100);
    values.push(lim);
    const sql = `SELECT id, edrpou, name
      FROM opendata_large_taxpayers WHERE ${conditions.join(' AND ')}
      ORDER BY name LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) return this.wrapResponse('Великих платників податків не знайдено');
      return this.wrapSearchResults(result.rows, lim);
    } catch (error: any) {
      logger.error('search_large_taxpayers error', { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }
}
