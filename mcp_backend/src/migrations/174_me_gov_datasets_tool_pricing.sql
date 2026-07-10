-- Migration 174: pricing for me.gov.ua (Ministry of Economy) open-data search tools
-- Exposed via the openreyestr service (data lives in openreyestr DB: me_datasets/
-- me_resources/me_records). Non-LLM SQL tools, priced like other openreyestr search tools.

INSERT INTO tool_pricing (tool_name, service, display_name, base_cost_usd, notes)
VALUES
  ('openreyestr_search_me_datasets', 'openreyestr', 'Датасети Мінекономіки', 0.00100000, '69 наборів відкритих даних Мінекономіки'),
  ('openreyestr_search_me_records',  'openreyestr', 'Дані Мінекономіки',     0.00100000, '~274K рядків у 150 ресурсах Мінекономіки')
ON CONFLICT (tool_name) DO UPDATE SET
  base_cost_usd = EXCLUDED.base_cost_usd,
  display_name = EXCLUDED.display_name,
  notes = EXCLUDED.notes;
