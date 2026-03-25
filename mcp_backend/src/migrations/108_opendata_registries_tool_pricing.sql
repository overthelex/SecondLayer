-- Migration 108: Add pricing for opendata registry tools
-- 9 backend tools + 3 OpenReyestr tools

INSERT INTO tool_pricing (tool_name, service, description, estimated_cost_usd, notes)
VALUES
  ('search_public_organizations',    'backend',     'Реєстр громадських формувань',       0.00300000, '1.08M записів — ГО, партії, профспілки'),
  ('search_case_distribution',       'backend',     'Автоматичний розподіл справ',        0.00300000, '71K протоколів розподілу ДСАУ'),
  ('search_missing_persons',         'backend',     'Зниклі безвісти',                    0.00300000, '112K записів МВС'),
  ('search_securities_owners',       'backend',     'Власники цінних паперів НКЦПФР',     0.00300000, '128K записів істотної участі'),
  ('search_wanted_persons',          'backend',     'Розшукувані особи',                  0.00300000, '71K записів МВС'),
  ('search_wanted_vehicles',         'backend',     'Розшукувані ТЗ',                     0.00300000, '78K записів МВС'),
  ('search_judges',                  'backend',     'Реєстр суддів ВККС',                 0.00300000, '6K поточних + 417K історичних'),
  ('search_court_experts_registry',  'backend',     'Судові експерти (Мін''юст)',          0.00300000, '80K атестованих експертів'),
  ('search_vat_payers_registry',     'backend',     'Платники ПДВ (ДПС)',                 0.00100000, '264K записів'),
  ('openreyestr_search_nazk_declarations',   'openreyestr', 'Декларації НАЗК',           0.00300000, '322K антикорупційних декларацій'),
  ('openreyestr_search_exchange_data',       'openreyestr', 'Обмін даними з держорганами', 0.00100000, '23.2M записів обміну'),
  ('openreyestr_search_arma_seized_assets',  'openreyestr', 'Арештовані активи АРМА',    0.00300000, '725K записів реєстру АРМА')
ON CONFLICT (tool_name) DO UPDATE SET
  estimated_cost_usd = EXCLUDED.estimated_cost_usd,
  description = EXCLUDED.description,
  notes = EXCLUDED.notes;
