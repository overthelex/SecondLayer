/**
 * Open Data Sync Configuration
 *
 * Defines all data sources, their sync frequencies, and target services.
 * Frequencies use node-cron syntax: second(opt) minute hour day month weekday
 */

export type SyncTarget = 'backend' | 'openreyestr';

export interface DataSourceSchedule {
  name: string;
  title: string;
  /** node-cron expression */
  cron: string;
  /** Which service handles the import */
  target: SyncTarget;
  /** For backend: source_name from import_source_catalog. For openreyestr: registry name */
  sourceName: string;
  /** Whether this source is enabled */
  enabled: boolean;
}

// ─── Backend data sources (import via /api/tools/start_import) ──────────

const backendDailySources: DataSourceSchedule[] = [
  {
    name: 'mvs_wanted_persons',
    title: 'МВС — Особи в розшуку',
    cron: '0 3 * * *', // 03:00 daily
    target: 'backend',
    sourceName: 'mvs_wanted_persons',
    enabled: true,
  },
  {
    name: 'mvs_missing_persons',
    title: 'МВС — Безвісно зниклі',
    cron: '0 3 * * *', // 03:00 daily
    target: 'backend',
    sourceName: 'mvs_missing_persons',
    enabled: true,
  },
  {
    name: 'mvs_wanted_vehicles',
    title: 'МВС — Транспорт у розшуку',
    cron: '0 3 * * *', // 03:00 daily
    target: 'backend',
    sourceName: 'mvs_wanted_vehicles',
    enabled: true,
  },
  {
    name: 'nazk_corruption',
    title: 'НАЗК — Корупціонери',
    cron: '30 3 * * *', // 03:30 daily
    target: 'backend',
    sourceName: 'nazk_corruption',
    enabled: true,
  },
  {
    name: 'invalid_passports',
    title: 'МВС — Недійсні паспорти',
    cron: '0 4 * * *', // 04:00 daily
    target: 'backend',
    sourceName: 'invalid_passports',
    enabled: true,
  },
  {
    name: 'invalid_passports_foreign',
    title: 'МВС — Недійсні закордонні паспорти',
    cron: '15 4 * * *', // 04:15 daily
    target: 'backend',
    sourceName: 'invalid_passports_foreign',
    enabled: true,
  },
  {
    name: 'nazk_corruption_offenders',
    title: 'НАЗК — Корупційні правопорушники',
    cron: '45 3 * * *', // 03:45 daily
    target: 'backend',
    sourceName: 'nazk_corruption_offenders',
    enabled: true,
  },
  {
    name: 'nazk_declaration_checks',
    title: 'НАЗК — Перевірки декларацій',
    cron: '0 6 * * *', // 06:00 daily
    target: 'backend',
    sourceName: 'nazk_declaration_checks',
    enabled: true,
  },
];

const backendWeeklySources: DataSourceSchedule[] = [
  {
    name: 'nipo_trademarks',
    title: 'УІПВ — Торгові марки',
    cron: '0 2 * * 0', // Sunday 02:00
    target: 'backend',
    sourceName: 'nipo_trademarks',
    enabled: true,
  },
  {
    name: 'nipo_patents',
    title: 'УІПВ — Патенти на винаходи',
    cron: '0 2 * * 0', // Sunday 02:00
    target: 'backend',
    sourceName: 'nipo_patents',
    enabled: true,
  },
  {
    name: 'nipo_utility_models',
    title: 'УІПВ — Корисні моделі',
    cron: '30 2 * * 0', // Sunday 02:30
    target: 'backend',
    sourceName: 'nipo_utility_models',
    enabled: true,
  },
  {
    name: 'nipo_designs',
    title: 'УІПВ — Промислові зразки',
    cron: '0 4 * * 0', // Sunday 04:00
    target: 'backend',
    sourceName: 'nipo_designs',
    enabled: true,
  },
  {
    name: 'dsfmu_terrorism',
    title: 'ДСФМУ — Перелік терористів',
    cron: '0 6 * * 0', // Sunday 06:00
    target: 'backend',
    sourceName: 'dsfmu_terrorism',
    enabled: true,
  },
  {
    name: 'lustration',
    title: 'Мін\'юст — Реєстр люстрованих',
    cron: '15 6 * * 0', // Sunday 06:15
    target: 'backend',
    sourceName: 'lustration',
    enabled: true,
  },
  {
    name: 'state_aid',
    title: 'АМКУ — Реєстр держдопомоги',
    cron: '30 6 * * 0', // Sunday 06:30
    target: 'backend',
    sourceName: 'state_aid',
    enabled: true,
  },
  {
    name: 'advocates',
    title: 'Мін\'юст — Реєстр адвокатів (ЄРАУ)',
    cron: '45 6 * * 0', // Sunday 06:45
    target: 'backend',
    sourceName: 'advocates',
    enabled: true,
  },
  {
    name: 'court_case_status',
    title: 'Судова влада — Стан розгляду справ',
    cron: '0 7 * * 0', // Sunday 07:00
    target: 'backend',
    sourceName: 'court_case_status',
    enabled: true,
  },
  {
    name: 'court_schedule',
    title: 'Судова влада — Розклад засідань',
    cron: '30 7 * * 0', // Sunday 07:30
    target: 'backend',
    sourceName: 'court_schedule',
    enabled: true,
  },
  {
    name: 'large_taxpayers',
    title: 'ДПС — Великі платники податків',
    cron: '0 8 * * 0', // Sunday 08:00
    target: 'backend',
    sourceName: 'large_taxpayers',
    enabled: true,
  },
  {
    name: 'wage_debtors',
    title: 'Держпраці — Боржники по зарплаті',
    cron: '15 8 * * 0', // Sunday 08:15
    target: 'backend',
    sourceName: 'wage_debtors',
    enabled: true,
  },
  {
    name: 'judge_candidates',
    title: 'ВККС — Кандидати на посади суддів',
    cron: '30 8 * * 0', // Sunday 08:30
    target: 'backend',
    sourceName: 'judge_candidates',
    enabled: true,
  },
];

// ─── OpenReyestr NAIS registries (sync via HTTP trigger) ────────────

const naisDailySources: DataSourceSchedule[] = [
  {
    name: 'nais_arbitration_managers',
    title: 'НАІС — Арбітражні керуючі',
    cron: '0 4 * * *', // 04:00 daily
    target: 'openreyestr',
    sourceName: 'arbitration_managers',
    enabled: true,
  },
  {
    name: 'nais_bankruptcy_cases',
    title: 'НАІС — Банкрутство',
    cron: '15 4 * * *', // 04:15 daily
    target: 'openreyestr',
    sourceName: 'bankruptcy_cases',
    enabled: true,
  },
  {
    name: 'nais_enforcement',
    title: 'НАІС — Виконавчі провадження (АСВП)',
    cron: '30 4 * * *', // 04:30 daily
    target: 'openreyestr',
    sourceName: 'enforcement_proceedings',
    enabled: true,
  },
  {
    name: 'nais_debtors',
    title: 'НАІС — Єдиний реєстр боржників',
    cron: '0 5 * * *', // 05:00 daily
    target: 'openreyestr',
    sourceName: 'debtors',
    enabled: true,
  },
];

const naisWeeklySources: DataSourceSchedule[] = [
  {
    name: 'nais_notaries',
    title: 'НАІС — Нотаріуси',
    cron: '0 2 * * 1', // Monday 02:00
    target: 'openreyestr',
    sourceName: 'notaries',
    enabled: true,
  },
  {
    name: 'nais_court_experts',
    title: 'НАІС — Судові експерти',
    cron: '15 2 * * 1', // Monday 02:15
    target: 'openreyestr',
    sourceName: 'court_experts',
    enabled: true,
  },
  {
    name: 'nais_special_forms',
    title: 'НАІС — Спеціальні бланки',
    cron: '30 2 * * 1', // Monday 02:30
    target: 'openreyestr',
    sourceName: 'special_forms',
    enabled: true,
  },
  {
    name: 'nais_forensic_methods',
    title: 'НАІС — Методики експертиз',
    cron: '45 2 * * 1', // Monday 02:45
    target: 'openreyestr',
    sourceName: 'forensic_methods',
    enabled: true,
  },
  {
    name: 'nais_legal_acts',
    title: 'НАІС — ЄДРНПА',
    cron: '0 3 * * 1', // Monday 03:00
    target: 'openreyestr',
    sourceName: 'legal_acts',
    enabled: true,
  },
  {
    name: 'nais_administrative_units',
    title: 'НАІС — Адмін. одиниці',
    cron: '30 3 * * 1', // Monday 03:30
    target: 'openreyestr',
    sourceName: 'administrative_units',
    enabled: true,
  },
  {
    name: 'nais_streets',
    title: 'НАІС — Вулиці',
    cron: '0 5 * * 1', // Monday 05:00
    target: 'openreyestr',
    sourceName: 'streets',
    enabled: true,
  },
];

// ─── All sources ───────────────────────────────────────────────────

export const ALL_SOURCES: DataSourceSchedule[] = [
  ...backendDailySources,
  ...backendWeeklySources,
  ...naisDailySources,
  ...naisWeeklySources,
];

// ─── Environment config ────────────────────────────────────────────

export interface ServiceConfig {
  backendUrl: string;
  backendApiKey: string;
  openreyestrUrl: string;
  openreyestrApiKey: string;
  healthPort: number;
  timezone: string;
}

export function loadConfig(): ServiceConfig {
  return {
    backendUrl: process.env.BACKEND_URL || 'http://app-prod:3000',
    backendApiKey: process.env.BACKEND_API_KEY || '',
    openreyestrUrl: process.env.OPENREYESTR_URL || 'http://app-openreyestr-prod:3005',
    openreyestrApiKey: process.env.OPENREYESTR_API_KEY || '',
    healthPort: parseInt(process.env.HEALTH_PORT || '3010', 10),
    timezone: process.env.TZ || 'Europe/Kiev',
  };
}
