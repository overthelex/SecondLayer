-- Migration 107: Add pricing for new MCP tools
-- 6 backend tools + 2 OpenReyestr tools

INSERT INTO tool_pricing (tool_name, service, display_name, base_cost_usd, notes)
VALUES
  ('search_vrp_decisions',          'backend',     'Рішення ВРП',                          0.00300000, '16.5K рішень Вищої ради правосуддя'),
  ('search_vrp_judges_discipline',  'backend',     'Дисциплінарна практика ВРП',            0.00300000, 'Звільнені, відсторонені судді, втручання'),
  ('search_vkks',                   'backend',     'Дані ВККС',                             0.00300000, 'Судді, оцінювання, декларації, вакансії, ефективність'),
  ('search_declaration_checks',     'backend',     'Перевірки декларацій',                   0.00300000, 'Результати перевірок НАЗК'),
  ('search_wage_debtors',           'backend',     'Боржники із зарплати',                   0.00300000, 'Підприємства з заборгованістю по зарплаті'),
  ('search_large_taxpayers',        'backend',     'Великі платники податків',                0.00100000, 'Реєстр великих платників податків'),
  ('openreyestr_search_termination_started', 'openreyestr', 'Припинення юросіб',            0.00300000, '148K записів про початок припинення'),
  ('openreyestr_search_rnbo_sanctions',      'openreyestr', 'Санкції РНБО',                 0.00300000, '21K записів санкційних списків РНБО')
ON CONFLICT (tool_name) DO UPDATE SET
  base_cost_usd = EXCLUDED.base_cost_usd,
  display_name = EXCLUDED.display_name,
  notes = EXCLUDED.notes;
