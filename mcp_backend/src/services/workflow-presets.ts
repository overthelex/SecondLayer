/**
 * Workflow Presets — Pre-defined workflow templates for common legal scenarios.
 *
 * Military lawyer preset provides 5 ready-to-run workflows covering
 * the most common military criminal defense scenarios in Ukraine (2022-2026).
 */

import type { GeneratedWorkflowSet } from './workflow-generator-service.js';

export interface WorkflowPresetMeta {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
  stepsCount: number;
}

export const WORKFLOW_PRESET_LIST: WorkflowPresetMeta[] = [
  {
    id: 'military_defense',
    title: 'Військовий адвокат: повний аналіз',
    description: 'Комплексний аналіз судової практики по військових злочинах: самовільне залишення частини, дезертирство, ухилення від мобілізації, непокора. 273K+ рішень.',
    icon: 'shield',
    category: 'military',
    tags: ['кримінальне право', 'судова практика', 'законодавство'],
    stepsCount: 5,
  },
  {
    id: 'military_awol',
    title: 'Ст. 407 КК — Самовільне залишення частини',
    description: 'Аналіз 191K+ рішень по ст. 407 КК: статистика вироків, позиції ВС, пом\'якшуючі обставини, типові покарання.',
    icon: 'user-x',
    category: 'military',
    tags: ['кримінальне право', 'судова практика'],
    stepsCount: 3,
  },
  {
    id: 'military_draft_evasion',
    title: 'Ухилення від мобілізації',
    description: 'Аналіз 26K+ рішень щодо ухилення від призову: адмінвідповідальність, кримінальна відповідальність, практика ТЦК.',
    icon: 'shield-alert',
    category: 'military',
    tags: ['адмінправо', 'кримінальне право', 'судова практика'],
    stepsCount: 3,
  },
];

export function getWorkflowPreset(presetId: string): GeneratedWorkflowSet | null {
  switch (presetId) {
    case 'military_defense':
      return MILITARY_DEFENSE_FULL;
    case 'military_awol':
      return MILITARY_AWOL;
    case 'military_draft_evasion':
      return MILITARY_DRAFT_EVASION;
    default:
      return null;
  }
}

const MILITARY_DEFENSE_FULL: GeneratedWorkflowSet = {
  title: 'Військовий адвокат: комплексний аналіз практики',
  description: 'Аналіз судової практики по основних категоріях військових злочинів з 24.02.2022: статистика, позиції ВС, законодавча база, пом\'якшуючі обставини.',
  workflows: [
    {
      sequenceNumber: 1,
      title: 'Статистика військових справ з початку повномасштабного вторгнення',
      description: 'Загальний обсяг та розподіл військових кримінальних справ за категоріями',
      plan: {
        goal: 'Визначити обсяг та розподіл військових справ з 24.02.2022',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'awol', date_from: '2022-02-24', limit: 5 },
            purpose: 'Кількість справ по ст. 407 КК (самовільне залишення)',
          },
          {
            id: 2,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'desertion', date_from: '2022-02-24', limit: 5 },
            purpose: 'Кількість справ по ст. 408 КК (дезертирство)',
          },
          {
            id: 3,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'insubordination', date_from: '2022-02-24', limit: 5 },
            purpose: 'Кількість справ по ст. 402 КК (непокора)',
          },
          {
            id: 4,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'draft_evasion', date_from: '2022-02-24', limit: 5 },
            purpose: 'Кількість справ щодо ухилення від мобілізації',
          },
        ],
      },
    },
    {
      sequenceNumber: 2,
      title: 'Правові позиції Верховного Суду по військових злочинах',
      description: 'Пошук прецедентних рішень ВС по ст. 407, 408, 402 КК',
      plan: {
        goal: 'Знайти ключові правові позиції ВС щодо військових злочинів',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'awol', instance_code: 1, date_from: '2022-02-24', judgment_code: 1, limit: 10 },
            purpose: 'Вироки касаційної інстанції по самовільному залишенню частини',
          },
          {
            id: 2,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'desertion', instance_code: 1, date_from: '2022-02-24', judgment_code: 1, limit: 10 },
            purpose: 'Вироки касаційної інстанції по дезертирству',
          },
        ],
      },
    },
    {
      sequenceNumber: 3,
      title: 'Законодавча база для військового захисту',
      description: 'Ключові статті КК, статутів ЗСУ, ЗУ про воєнний стан',
      plan: {
        goal: 'Зібрати нормативну базу для захисту у військових справах',
        steps: [
          {
            id: 1,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КК ст. 407' },
            purpose: 'Ст. 407 КК — Самовільне залишення частини',
          },
          {
            id: 2,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КК ст. 408' },
            purpose: 'Ст. 408 КК — Дезертирство',
          },
          {
            id: 3,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'ст. 1 Закону про воєнний стан' },
            purpose: 'ЗУ Про воєнний стан — визначення',
          },
          {
            id: 4,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'ст. 12 Закону про мобілізацію' },
            purpose: 'ЗУ Про мобілізацію — обов\'язки громадян',
          },
        ],
      },
    },
    {
      sequenceNumber: 4,
      title: 'Аналіз пом\'якшуючих обставин у військових справах',
      description: 'Повнотекстовий пошук рішень з пом\'якшуючими обставинами',
      plan: {
        goal: 'Знайти рішення з пом\'якшуючими обставинами для побудови стратегії захисту',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_fulltext',
            params: { query: 'пом\'якшуючі обставини самовільне залишення частини звільнений від покарання', justice_kind: 2, limit: 10 },
            purpose: 'Рішення зі звільненням від покарання по ст. 407 КК',
          },
          {
            id: 2,
            tool: 'search_edrsr_fulltext',
            params: { query: 'угода про визнання винуватості самовільне залишення військової частини', justice_kind: 2, limit: 10 },
            purpose: 'Рішення з угодами про визнання винуватості',
          },
        ],
      },
    },
    {
      sequenceNumber: 5,
      title: 'Ухилення від мобілізації: адмін vs кримінальна відповідальність',
      description: 'Порівняння адміністративної та кримінальної практики по ухиленню',
      plan: {
        goal: 'Розмежувати адмін та кримінальну відповідальність за ухилення від мобілізації',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'draft_evasion', justice_kind: 5, date_from: '2024-01-01', limit: 10 },
            purpose: 'Адміністративні справи по ухиленню (КУпАП ст. 210-1)',
          },
          {
            id: 2,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'draft_evasion', justice_kind: 2, date_from: '2024-01-01', limit: 10 },
            purpose: 'Кримінальні справи по ухиленню від мобілізації',
          },
          {
            id: 3,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КУпАП ст. 210' },
            purpose: 'Ст. 210 КУпАП — адмінвідповідальність за порушення військового обліку',
          },
        ],
      },
    },
  ],
};

const MILITARY_AWOL: GeneratedWorkflowSet = {
  title: 'Ст. 407 КК — Самовільне залишення частини: повний аналіз',
  description: 'Детальний аналіз 191K+ рішень по ст. 407 КК: типові покарання, позиції ВС, пом\'якшуючі та обтяжуючі обставини, статистика по інстанціях.',
  workflows: [
    {
      sequenceNumber: 1,
      title: 'Статистика та розподіл по інстанціях',
      description: 'Кількість справ по ст. 407 КК в розрізі інстанцій та років',
      plan: {
        goal: 'Визначити обсяг та динаміку справ по ст. 407 КК',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'awol', instance_code: 3, date_from: '2022-02-24', limit: 5 },
            purpose: 'Справи першої інстанції',
          },
          {
            id: 2,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'awol', instance_code: 2, date_from: '2022-02-24', limit: 5 },
            purpose: 'Апеляційні рішення',
          },
          {
            id: 3,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'awol', instance_code: 1, date_from: '2022-02-24', limit: 5 },
            purpose: 'Касаційні рішення ВС',
          },
        ],
      },
    },
    {
      sequenceNumber: 2,
      title: 'Типові покарання та звільнення від покарання',
      description: 'Пошук вироків з різними видами покарань',
      plan: {
        goal: 'Визначити спектр покарань по ст. 407 КК',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_fulltext',
            params: { query: 'стаття 407 позбавлення волі вирок засуджено', justice_kind: 2, limit: 10 },
            purpose: 'Вироки з реальним позбавленням волі',
          },
          {
            id: 2,
            tool: 'search_edrsr_fulltext',
            params: { query: 'стаття 407 звільнити від покарання випробувальний строк', justice_kind: 2, limit: 10 },
            purpose: 'Вироки зі звільненням від покарання',
          },
          {
            id: 3,
            tool: 'search_edrsr_fulltext',
            params: { query: 'стаття 407 закрити кримінальне провадження звільнити', justice_kind: 2, limit: 10 },
            purpose: 'Закриття провадження',
          },
        ],
      },
    },
    {
      sequenceNumber: 3,
      title: 'Нормативна база: ст. 407 КК + Статут внутрішньої служби',
      description: 'Тексти ключових норм для захисту',
      plan: {
        goal: 'Зібрати нормативну базу для ст. 407 КК',
        steps: [
          {
            id: 1,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КК ст. 407' },
            purpose: 'Текст ст. 407 КК — Самовільне залишення частини',
          },
          {
            id: 2,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КК ст. 66' },
            purpose: 'Ст. 66 КК — Обставини, які пом\'якшують покарання',
          },
          {
            id: 3,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КК ст. 75' },
            purpose: 'Ст. 75 КК — Звільнення від відбування покарання з випробуванням',
          },
        ],
      },
    },
  ],
};

const MILITARY_DRAFT_EVASION: GeneratedWorkflowSet = {
  title: 'Ухилення від мобілізації: аналіз практики',
  description: 'Аналіз 26K+ рішень: адмін vs кримінальна відповідальність, роль ТЦК, бронювання, відстрочки.',
  workflows: [
    {
      sequenceNumber: 1,
      title: 'Обсяг справ та розподіл за видами відповідальності',
      description: 'Порівняння адмін та кримінальних справ по ухиленню',
      plan: {
        goal: 'Визначити співвідношення адмін/кримінальної відповідальності',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'draft_evasion', justice_kind: 5, date_from: '2024-01-01', limit: 10 },
            purpose: 'Адміністративні справи (КУпАП ст. 210, 210-1)',
          },
          {
            id: 2,
            tool: 'search_edrsr_decisions',
            params: { military_preset: 'draft_evasion', justice_kind: 2, date_from: '2024-01-01', limit: 10 },
            purpose: 'Кримінальні справи по ухиленню від мобілізації',
          },
        ],
      },
    },
    {
      sequenceNumber: 2,
      title: 'Нормативна база: мобілізація, бронювання, відстрочки',
      description: 'Ключові норми для захисту від обвинувачень в ухиленні',
      plan: {
        goal: 'Зібрати нормативну базу щодо мобілізації та відстрочок',
        steps: [
          {
            id: 1,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'ст. 1 Закону про мобілізацію' },
            purpose: 'ЗУ Про мобілізацію — визначення термінів',
          },
          {
            id: 2,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'КУпАП ст. 210' },
            purpose: 'КУпАП ст. 210 — адмінвідповідальність',
          },
          {
            id: 3,
            tool: 'get_legislation_section',
            params: { legislation_reference: 'ст. 23 Закону про мобілізацію' },
            purpose: 'Підстави для відстрочки від мобілізації',
          },
        ],
      },
    },
    {
      sequenceNumber: 3,
      title: 'Судова практика: підстави для закриття справ',
      description: 'Пошук рішень де справи закривались або обвинувачення було змінено',
      plan: {
        goal: 'Знайти успішні кейси захисту від обвинувачень в ухиленні',
        steps: [
          {
            id: 1,
            tool: 'search_edrsr_fulltext',
            params: { query: 'ухилення мобілізація закрити провадження виправдати', justice_kind: 2, limit: 10 },
            purpose: 'Справи з закриттям провадження',
          },
          {
            id: 2,
            tool: 'search_edrsr_fulltext',
            params: { query: 'неналежне повідомлення ТЦК вручення повістки ухилення', justice_kind: 2, limit: 10 },
            purpose: 'Справи з неналежним повідомленням ТЦК',
          },
        ],
      },
    },
  ],
};
