/**
 * Registry Catalog — declarative config for all parametric opendata search tools.
 *
 * Each entry describes one registry: table, columns, searchable fields,
 * match types, ordering, and Ukrainian descriptions for the LLM.
 *
 * 22 registries consolidated from 5 former handler files:
 * opendata-registries-tools.ts, opendata-tools.ts, tier1-opendata-tools.ts,
 * state-registry-tools.ts, spending-tools.ts (partial).
 */

export type MatchType =
  | 'ilike'         // col ILIKE $N  (%val%)
  | 'exact'         // col = $N
  | 'ilike_multi'   // (col1 ILIKE $N OR col2 ILIKE $N ...)  (%val%)
  | 'exact_multi'   // (col1 = $N OR col2 = $N ...)
  | 'gte'           // col >= $N
  | 'lte'           // col <= $N
  | 'array_contains' // $N = ANY(col)
  | 'ilike_cast';    // col::text ILIKE $N  (%val%)

export interface FieldDef {
  name: string;
  description: string;
  match: MatchType;
  columns: string[];
  type?: 'string' | 'number' | 'boolean';
  transform?: 'uppercase';
}

export interface RegistryDef {
  title: string;
  description: string;
  table: string;
  selectColumns: string;
  orderBy: string;
  fields: FieldDef[];
  emptyMessage: string;
  defaultLimit?: number;
  maxLimit?: number;
  requiredFields?: string[];
}

export const REGISTRY_CATALOG: Record<string, RegistryDef> = {

  // ── opendata-registries-tools.ts ──────────────────────────────────

  public_organizations: {
    title: 'Реєстр громадських формувань',
    description: 'Пошук у реєстрі громадських формувань (ГО, партії, профспілки, релігійні організації тощо)\n\n1.08M записів. Пошук за назвою, ЄДРПОУ, типом реєстру, статусом, засновниками.',
    table: 'opendata_public_organizations',
    selectColumns: 'registry_type, reg_num, date_reg, name, edrpou, state, address, phone, founders, governing_body, kved, territory, obj_status',
    orderBy: 'date_reg DESC NULLS LAST',
    emptyMessage: 'Громадських формувань не знайдено',
    fields: [
      { name: 'name', description: 'Назва організації', match: 'ilike', columns: ['name'] },
      { name: 'edrpou', description: 'Код ЄДРПОУ', match: 'exact', columns: ['edrpou'] },
      { name: 'registry_type', description: 'Тип реєстру (ГО, партія, профспілка тощо)', match: 'ilike', columns: ['registry_type'] },
      { name: 'state', description: 'Стан (зареєстровано, припинено тощо)', match: 'ilike', columns: ['state'] },
      { name: 'founders', description: 'Засновники (пошук за текстом)', match: 'ilike_cast', columns: ['founders'] },
      { name: 'address', description: 'Адреса', match: 'ilike', columns: ['address'] },
    ],
  },

  case_distribution: {
    title: 'Розподіл судових справ',
    description: 'Пошук у протоколах автоматичного розподілу судових справ (ДСАУ)\n\n71K записів. Пошук за номером справи, суддею, судом, учасниками, категорією справи.',
    table: 'dsa_case_distribution',
    selectColumns: 'cause_number, court_name, case_category, case_complexity, case_essence, presiding_judge, panel_judges, participants, distribution_basis, distribution_start, distribution_end, excluded_judges, source_date',
    orderBy: 'distribution_start DESC NULLS LAST',
    emptyMessage: 'Протоколів розподілу не знайдено',
    fields: [
      { name: 'cause_number', description: 'Номер справи', match: 'exact', columns: ['cause_number'] },
      { name: 'court_name', description: 'Назва суду', match: 'ilike', columns: ['court_name'] },
      { name: 'judges', description: 'Прізвище судді', match: 'ilike_multi', columns: ['judges', 'participating_judges', 'panel_judges'] },
      { name: 'presiding_judge', description: 'Головуючий суддя', match: 'ilike', columns: ['presiding_judge'] },
      { name: 'participants', description: 'Учасники справи', match: 'ilike', columns: ['participants'] },
      { name: 'case_category', description: 'Категорія справи', match: 'ilike', columns: ['case_category'] },
      { name: 'case_essence', description: 'Суть справи (ключові слова)', match: 'ilike', columns: ['case_essence'] },
    ],
  },

  missing_persons: {
    title: 'Зниклі безвісти',
    description: 'Пошук у реєстрі зниклих безвісти осіб (МВС)\n\n112K записів. Пошук за прізвищем, ОВД, категорією, датою зникнення, місцем.',
    table: 'opendata_missing_persons',
    selectColumns: 'last_name_u, first_name_u, middle_name_u, birth_date, sex, ovd, category, lost_date, lost_place, article_crim, restraint, contact',
    orderBy: 'lost_date DESC NULLS LAST',
    emptyMessage: 'Зниклих безвісти не знайдено',
    fields: [
      { name: 'last_name', description: 'Прізвище', match: 'ilike_multi', columns: ['last_name_u', 'last_name_r', 'last_name_e'] },
      { name: 'first_name', description: "Ім'я", match: 'ilike_multi', columns: ['first_name_u', 'first_name_r', 'first_name_e'] },
      { name: 'ovd', description: 'Орган внутрішніх справ', match: 'ilike', columns: ['ovd'] },
      { name: 'category', description: 'Категорія зниклого', match: 'ilike', columns: ['category'] },
      { name: 'lost_place', description: 'Місце зникнення', match: 'ilike', columns: ['lost_place'] },
      { name: 'sex', description: 'Стать (чол/жін)', match: 'exact', columns: ['sex'] },
    ],
  },

  securities_owners: {
    title: 'Власники цінних паперів',
    description: 'Пошук власників істотної участі у цінних паперах (НКЦПФР)\n\n128K записів. Пошук за емітентом, власником, ЄДРПОУ, ISIN-кодом, часткою.',
    table: 'opendata_securities_owners',
    selectColumns: 'report_date, issuer_edrpou, issuer_name, isin_code, owner_edrpou, owner_name, owner_name_alt, owner_type, share_percent, nominal_value, share_count, country_code',
    orderBy: 'share_percent DESC NULLS LAST',
    emptyMessage: 'Власників цінних паперів не знайдено',
    fields: [
      { name: 'issuer_name', description: 'Назва емітента', match: 'ilike', columns: ['issuer_name'] },
      { name: 'issuer_edrpou', description: 'ЄДРПОУ емітента', match: 'exact', columns: ['issuer_edrpou'] },
      { name: 'owner_name', description: "Назва / ім'я власника", match: 'ilike_multi', columns: ['owner_name', 'owner_name_alt'] },
      { name: 'owner_edrpou', description: 'ЄДРПОУ власника', match: 'exact', columns: ['owner_edrpou'] },
      { name: 'isin_code', description: 'Код ISIN цінного паперу', match: 'exact', columns: ['isin_code'] },
      { name: 'min_share_percent', description: 'Мінімальна частка участі (%)', match: 'gte', columns: ['share_percent'], type: 'number' },
    ],
  },

  wanted_persons: {
    title: 'Розшукувані особи (МВС)',
    description: 'Пошук у реєстрі розшукуваних осіб (МВС)\n\n71K записів. Пошук за прізвищем, ОВД, статтею КК, категорією, запобіжним заходом.',
    table: 'opendata_wanted_persons',
    selectColumns: 'last_name_u, first_name_u, middle_name_u, birth_date, sex, ovd, category, lost_date, lost_place, article_crim, restraint, contact',
    orderBy: 'lost_date DESC NULLS LAST',
    emptyMessage: 'Розшукуваних осіб не знайдено',
    fields: [
      { name: 'last_name', description: 'Прізвище', match: 'ilike_multi', columns: ['last_name_u', 'last_name_r', 'last_name_e'] },
      { name: 'first_name', description: "Ім'я", match: 'ilike_multi', columns: ['first_name_u', 'first_name_r', 'first_name_e'] },
      { name: 'ovd', description: 'Орган внутрішніх справ', match: 'ilike', columns: ['ovd'] },
      { name: 'category', description: 'Категорія розшуку', match: 'ilike', columns: ['category'] },
      { name: 'article_crim', description: 'Стаття Кримінального кодексу', match: 'ilike', columns: ['article_crim'] },
      { name: 'restraint', description: 'Запобіжний захід', match: 'ilike', columns: ['restraint'] },
      { name: 'sex', description: 'Стать (чол/жін)', match: 'exact', columns: ['sex'] },
    ],
  },

  wanted_vehicles: {
    title: 'Розшукувані транспортні засоби',
    description: 'Пошук розшукуваних транспортних засобів (МВС)\n\n78K записів. Пошук за маркою, номером, кольором, номером кузова/шасі/двигуна.',
    table: 'opendata_wanted_vehicles',
    selectColumns: 'brand_model, car_type, color, vehicle_number, body_number, chassis_number, engine_number, illegal_seizure_date, organ_unit, insert_date',
    orderBy: 'insert_date DESC NULLS LAST',
    emptyMessage: 'Розшукуваних транспортних засобів не знайдено',
    fields: [
      { name: 'brand_model', description: 'Марка та модель', match: 'ilike', columns: ['brand_model'] },
      { name: 'vehicle_number', description: 'Державний номерний знак', match: 'ilike', columns: ['vehicle_number'] },
      { name: 'color', description: 'Колір', match: 'ilike', columns: ['color'] },
      { name: 'car_type', description: 'Тип транспорту', match: 'ilike', columns: ['car_type'] },
      { name: 'body_number', description: 'Номер кузова', match: 'exact', columns: ['body_number'] },
      { name: 'chassis_number', description: 'Номер шасі', match: 'exact', columns: ['chassis_number'] },
      { name: 'engine_number', description: 'Номер двигуна', match: 'exact', columns: ['engine_number'] },
      { name: 'organ_unit', description: 'Орган, що розшукує', match: 'ilike', columns: ['organ_unit'] },
    ],
  },

  court_experts: {
    title: 'Реєстр судових експертів',
    description: "Пошук атестованих судових експертів (Мін'юст)\n\n80K записів. Пошук за прізвищем, установою, регіоном, типом експертизи, спеціалізацією.",
    table: 'opendata_court_experts',
    selectColumns: 'surname, first_name, patronymic, org_name, region, phone, commission, license_num, valid_date, exp_type, specialization',
    orderBy: 'surname, first_name',
    emptyMessage: 'Судових експертів не знайдено',
    fields: [
      { name: 'surname', description: 'Прізвище експерта', match: 'ilike', columns: ['surname'] },
      { name: 'first_name', description: "Ім'я експерта", match: 'ilike', columns: ['first_name'] },
      { name: 'org_name', description: 'Назва установи', match: 'ilike', columns: ['org_name'] },
      { name: 'region', description: 'Регіон', match: 'ilike', columns: ['region'] },
      { name: 'exp_type', description: 'Тип експертизи', match: 'ilike', columns: ['exp_type'] },
      { name: 'specialization', description: 'Спеціалізація', match: 'ilike', columns: ['specialization'] },
      { name: 'license_num', description: 'Номер свідоцтва', match: 'exact', columns: ['license_num'] },
    ],
  },

  vat_payers: {
    title: 'Реєстр платників ПДВ',
    description: 'Пошук у реєстрі платників ПДВ (ДПС)\n\n264K записів. Пошук за назвою або кодом ПДВ.',
    table: 'opendata_vat_payers',
    selectColumns: 'name, kod_pdv, dat_reestr, dat_term',
    orderBy: 'dat_reestr DESC NULLS LAST',
    emptyMessage: 'Платників ПДВ не знайдено',
    fields: [
      { name: 'name', description: 'Назва компанії або ФОП', match: 'ilike', columns: ['name'] },
      { name: 'kod_pdv', description: 'Код ПДВ', match: 'exact', columns: ['kod_pdv'] },
    ],
  },

  // ── opendata-tools.ts ─────────────────────────────────────────────

  sanctions: {
    title: 'Санкційні списки',
    description: 'Пошук у міжнародних санкційних списках (OpenSanctions, 346 датасетів)\n\nВключає: РНБО, OFAC, EU, UN, UK та 340+ інших санкційних програм.\n1.25M записів: фізичні особи, компанії, судна, літаки, криптогаманці.',
    table: 'opensanctions_entities',
    selectColumns: 'id, schema, name, aliases, birth_date, countries, identifiers, sanctions, datasets, first_seen, last_seen',
    orderBy: 'last_seen DESC NULLS LAST',
    emptyMessage: 'Записів у санкційних списках не знайдено',
    fields: [
      { name: 'name', description: "Ім'я або назва (нечіткий пошук)", match: 'ilike_multi', columns: ['name', 'aliases'] },
      { name: 'country', description: 'Код країни (ua, ru, ir тощо)', match: 'ilike', columns: ['countries'] },
      { name: 'schema', description: 'Тип: Person, Company, Organization, Vessel, Aircraft, CryptoWallet', match: 'exact', columns: ['schema'] },
      { name: 'dataset', description: 'Датасет (ua_nsdc_sanctions, us_ofac_sdn, eu_fsf тощо)', match: 'ilike', columns: ['datasets'] },
      { name: 'identifier', description: 'Ідентифікатор (ІПН, паспорт, ЄДРПОУ)', match: 'ilike', columns: ['identifiers'] },
    ],
  },

  trademarks: {
    title: 'Торговельні марки (Укрпатент)',
    description: 'Пошук торговельних марок (UIPV — Укрпатент)\n\n182K записів. Пошук за текстом марки, власником, ЄДРПОУ, класом NICE, статусом.',
    table: 'opendata_trademarks',
    selectColumns: 'app_number, app_date, registration_number, registration_date, expiry_date, mark_text, holder_name, holder_edrpou, holder_country, nice_classes, status',
    orderBy: 'registration_date DESC NULLS LAST',
    emptyMessage: 'Торговельних марок не знайдено',
    fields: [
      { name: 'mark_text', description: 'Текст торговельної марки', match: 'ilike', columns: ['mark_text'] },
      { name: 'holder_name', description: "Назва або ім'я власника", match: 'ilike_multi', columns: ['holder_name', 'applicant_name'] },
      { name: 'holder_edrpou', description: 'ЄДРПОУ власника', match: 'exact_multi', columns: ['holder_edrpou', 'applicant_edrpou'] },
      { name: 'nice_class', description: 'Клас NICE (1-45)', match: 'array_contains', columns: ['nice_classes'], type: 'number' },
      { name: 'status', description: 'Статус (зареєстровано, припинено тощо)', match: 'ilike', columns: ['status'] },
      { name: 'registration_number', description: 'Номер реєстрації', match: 'exact', columns: ['registration_number'] },
    ],
  },

  patents: {
    title: 'Патенти (Укрпатент)',
    description: 'Пошук патентів, корисних моделей та промислових зразків (UIPV — Укрпатент)\n\n119K записів. Пошук за назвою, власником, кодом МПК, номером заявки.',
    table: 'opendata_patents',
    selectColumns: 'app_number, app_date, registration_number, registration_date, obj_type_name, title_ua, title_en, abstract_ua, ipc_codes, owner_name, owner_country, status',
    orderBy: 'registration_date DESC NULLS LAST',
    emptyMessage: 'Патентів не знайдено',
    fields: [
      { name: 'title', description: 'Назва винаходу / корисної моделі', match: 'ilike_multi', columns: ['title_ua', 'title_en'] },
      { name: 'owner_name', description: "Ім'я або назва патентовласника", match: 'ilike', columns: ['owner_name'] },
      { name: 'ipc_code', description: 'Код МПК (наприклад, A61K)', match: 'array_contains', columns: ['ipc_codes'] },
      { name: 'app_number', description: 'Номер заявки', match: 'exact', columns: ['app_number'] },
      { name: 'registration_number', description: 'Номер патенту', match: 'exact', columns: ['registration_number'] },
      { name: 'obj_type', description: 'Тип: 1=винахід, 2=корисна модель, 3=промисл. зразок', match: 'exact', columns: ['obj_type'], type: 'number' },
    ],
  },

  corruption_register: {
    title: 'Реєстр корупціонерів',
    description: 'Пошук у Єдиному реєстрі осіб, які вчинили корупційні правопорушення\n\n58K записів. Пошук за прізвищем, статтею КК, назвою суду, видом покарання.',
    table: 'opendata_corruption',
    selectColumns: 'last_name, first_name, patronymic, entity_type, offense_name, punishment_type, punishment, codex_articles, court_case_number, sentence_date, court_name',
    orderBy: 'sentence_date DESC NULLS LAST',
    emptyMessage: 'Записів у реєстрі корупціонерів не знайдено',
    fields: [
      { name: 'last_name', description: 'Прізвище', match: 'ilike', columns: ['last_name'] },
      { name: 'first_name', description: "Ім'я", match: 'ilike', columns: ['first_name'] },
      { name: 'offense_name', description: 'Назва правопорушення', match: 'ilike', columns: ['offense_name'] },
      { name: 'codex_articles', description: 'Статті кодексу', match: 'ilike', columns: ['codex_articles'] },
      { name: 'court_name', description: 'Назва суду', match: 'ilike', columns: ['court_name'] },
    ],
  },

  lawyers: {
    title: 'Реєстр адвокатів',
    description: 'Пошук у Єдиному реєстрі адвокатів України\n\n73K записів. Пошук за прізвищем, радою адвокатів, статусом, номером свідоцтва.',
    table: 'opendata_lawyers',
    selectColumns: 'lawyer_id, last_name, first_name, patronymic, ra_name, certificate_num, certificate_date, decision_num, decision_date, authority_name, email, status, status_description, work_address, org_forms',
    orderBy: 'last_name, first_name',
    emptyMessage: 'Адвокатів не знайдено',
    fields: [
      { name: 'last_name', description: 'Прізвище адвоката', match: 'ilike', columns: ['last_name'] },
      { name: 'first_name', description: "Ім'я адвоката", match: 'ilike', columns: ['first_name'] },
      { name: 'ra_name', description: 'Назва ради адвокатів регіону', match: 'ilike', columns: ['ra_name'] },
      { name: 'status', description: 'Статус (діє, зупинено, припинено)', match: 'ilike', columns: ['status'] },
      { name: 'certificate_num', description: 'Номер свідоцтва', match: 'exact', columns: ['certificate_num'] },
    ],
  },

  vrp_decisions: {
    title: 'Рішення ВРП',
    description: 'Пошук рішень Вищої ради правосуддя (ВРП)\n\n16.5K записів. Пошук за назвою, органом, номером рішення, датою.\nВключає голосування та тексти рішень.',
    table: 'vrp_decisions',
    selectColumns: 'id, date_time, authority, title, decision_num, proceeding_ids, voting_title, voting_for, voting_against, voting_type, voting_result, texts',
    orderBy: 'date_time DESC NULLS LAST',
    emptyMessage: 'Рішень ВРП не знайдено',
    fields: [
      { name: 'title', description: 'Назва рішення (нечіткий пошук)', match: 'ilike', columns: ['title'] },
      { name: 'authority', description: 'Орган (наприклад, Пленум ВРП, Дисциплінарна палата)', match: 'exact', columns: ['authority'] },
      { name: 'decision_num', description: 'Номер рішення', match: 'exact', columns: ['decision_num'] },
      { name: 'date_from', description: 'Дата від (YYYY-MM-DD)', match: 'gte', columns: ['date_time'] },
      { name: 'date_to', description: 'Дата до (YYYY-MM-DD)', match: 'lte', columns: ['date_time'] },
    ],
  },

  declaration_checks: {
    title: 'Перевірки декларацій (НАЗК)',
    description: 'Пошук результатів перевірок декларацій (НАЗК)\n\n2K записів. Пошук за прізвищем, посадою, статусом перевірки, результатом.',
    table: 'opendata_declaration_checks',
    selectColumns: 'id, declaration_uid, family_name, name, additional_name, position, position_category, reporting_period, status, result, result_url, measures, completion_year',
    orderBy: 'family_name, name',
    emptyMessage: 'Перевірок декларацій не знайдено',
    fields: [
      { name: 'family_name', description: 'Прізвище декларанта', match: 'ilike', columns: ['family_name'] },
      { name: 'name', description: "Ім'я декларанта", match: 'ilike', columns: ['name'] },
      { name: 'position', description: 'Посада', match: 'ilike', columns: ['position'] },
      { name: 'status', description: 'Статус перевірки', match: 'ilike', columns: ['status'] },
      { name: 'result', description: 'Результат перевірки', match: 'ilike', columns: ['result'] },
    ],
  },

  wage_debtors: {
    title: 'Боржники із зарплати',
    description: 'Пошук боржників із заробітної плати\n\n1.3K записів. Пошук за назвою підприємства, регіоном, формою власності, видом діяльності.',
    table: 'opendata_wage_debtors',
    selectColumns: 'id, region, company_name, ownership_form, economic_activity, debt_2018_01, debt_2019_01, debt_2019_02_25, debt_reason',
    orderBy: 'company_name',
    emptyMessage: 'Боржників із зарплати не знайдено',
    fields: [
      { name: 'company_name', description: 'Назва підприємства', match: 'ilike', columns: ['company_name'] },
      { name: 'region', description: 'Регіон', match: 'ilike', columns: ['region'] },
      { name: 'ownership_form', description: 'Форма власності', match: 'ilike', columns: ['ownership_form'] },
      { name: 'economic_activity', description: 'Вид економічної діяльності', match: 'ilike', columns: ['economic_activity'] },
    ],
  },

  large_taxpayers: {
    title: 'Великі платники податків',
    description: 'Пошук у реєстрі великих платників податків\n\n1.3K записів. Пошук за ЄДРПОУ або назвою підприємства.',
    table: 'opendata_large_taxpayers',
    selectColumns: 'id, edrpou, name',
    orderBy: 'name',
    emptyMessage: 'Великих платників податків не знайдено',
    fields: [
      { name: 'edrpou', description: 'Код ЄДРПОУ', match: 'exact', columns: ['edrpou'] },
      { name: 'name', description: 'Назва підприємства', match: 'ilike', columns: ['name'] },
    ],
  },

  // ── tier1-opendata-tools.ts ───────────────────────────────────────

  vehicle_registrations: {
    title: 'Реєстрація транспорту',
    description: 'Пошук у реєстрі транспортних засобів та їх власників (МВС)\n\n19.5M записів з 2013 року. Дані: VIN, держномер, марка, модель, рік, колір, тип, реєстраційні операції.',
    table: 'opendata_vehicle_registrations',
    selectColumns: 'person_type, d_reg, oper_name, brand, model, vin, make_year, color, kind, body, purpose, fuel, capacity, n_reg_new, dep',
    orderBy: 'd_reg DESC NULLS LAST',
    emptyMessage: 'Транспортних засобів не знайдено',
    fields: [
      { name: 'vin', description: 'VIN-код транспортного засобу', match: 'exact', columns: ['vin'], transform: 'uppercase' },
      { name: 'n_reg_new', description: 'Державний номерний знак', match: 'ilike', columns: ['n_reg_new'], transform: 'uppercase' },
      { name: 'brand', description: 'Марка (TOYOTA, BMW тощо)', match: 'ilike', columns: ['brand'], transform: 'uppercase' },
      { name: 'model', description: 'Модель', match: 'ilike', columns: ['model'], transform: 'uppercase' },
      { name: 'make_year', description: 'Рік випуску', match: 'exact', columns: ['make_year'], type: 'number' },
      { name: 'oper_name', description: 'Тип операції (ПЕРЕРЕЄСТРАЦІЯ, ПЕРВИННА тощо)', match: 'ilike', columns: ['oper_name'] },
    ],
  },

  lustration: {
    title: 'Реєстр люстрації',
    description: 'Пошук у реєстрі осіб, щодо яких застосовано Закон "Про очищення влади"\n\n587 записів. Люстровані особи — заборона обіймати публічні посади.',
    table: 'opendata_lustration',
    selectColumns: 'fio, job, judgment, period',
    orderBy: 'fio',
    emptyMessage: 'Люстрованих осіб не знайдено',
    fields: [
      { name: 'fio', description: 'ПІБ особи', match: 'ilike', columns: ['fio'] },
      { name: 'job', description: 'Посада / місце роботи', match: 'ilike', columns: ['job'] },
    ],
  },

  state_aid: {
    title: 'Державна допомога',
    description: 'Пошук у реєстрі державної допомоги (АМКУ)\n\nПрограми держдопомоги з надавачами та отримувачами.',
    table: 'opendata_state_aid',
    selectColumns: 'provider_name, recipient_name, program_name, row_data',
    orderBy: 'id DESC',
    emptyMessage: 'Записів держдопомоги не знайдено',
    fields: [
      { name: 'provider_name', description: 'Назва надавача допомоги', match: 'ilike', columns: ['provider_name'] },
      { name: 'recipient_name', description: 'Назва отримувача допомоги', match: 'ilike', columns: ['recipient_name'] },
      { name: 'program_name', description: 'Назва програми допомоги', match: 'ilike', columns: ['program_name'] },
    ],
  },

  financial_statements: {
    title: 'Фінансова звітність',
    description: 'Пошук фінансової звітності підприємств за ЄДРПОУ (Держстат)\n\n504K XML-звітів. Баланси, звіти про фінрезультати (Форми 1-6) за ЄДРПОУ та рік.',
    table: 'opendata_financial_statements',
    selectColumns: 'tin, c_doc, c_doc_sub, c_doc_ver, period_year, period_month, period_type, c_reg, c_raj, form_type',
    orderBy: 'period_year DESC, form_type',
    emptyMessage: 'Фінансову звітність не знайдено',
    defaultLimit: 20,
    maxLimit: 50,
    requiredFields: ['tin'],
    fields: [
      { name: 'tin', description: 'ЄДРПОУ / ІПН підприємства', match: 'exact', columns: ['tin'] },
      { name: 'period_year', description: 'Рік звітності (2021-2025)', match: 'exact', columns: ['period_year'], type: 'number' },
      { name: 'form_type', description: 'Тип форми (S0100115 = Форма 1 тощо)', match: 'ilike', columns: ['form_type'] },
    ],
  },

  // ── state-registry-tools.ts ───────────────────────────────────────

  nbu_banks: {
    title: 'Банки з ліцензією НБУ',
    description: 'Пошук банків з ліцензією Національного банку України\n\nРеєстр містить усі банки України з банківською ліцензією НБУ (60 банків).\nДжерело: bank.gov.ua (Open Data API)',
    table: 'nbu_banks',
    selectColumns: 'shortname, fullname, kod_edrpou, n_stan, d_open, d_close, num_lic, dt_lic, n_pr_lic, n_obl, np, adress, p_ind, telefon, website, name_e, shortname_en, glmfo, idnbu',
    orderBy: 'shortname',
    emptyMessage: 'Банків не знайдено',
    fields: [
      { name: 'query', description: 'Назва банку або частина назви', match: 'ilike_multi', columns: ['shortname', 'fullname'] },
      { name: 'edrpou', description: 'Код ЄДРПОУ банку', match: 'exact', columns: ['kod_edrpou'] },
      { name: 'status', description: 'Статус банку (Нормальний, Неплатоспроможний, В стані ліквідації)', match: 'exact', columns: ['n_stan'] },
    ],
  },
};
