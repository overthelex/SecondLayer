-- Migration 175: pricing for V2 chat tools that had no tool_pricing row.
-- The V2 curated tool set (V2_TOOL_NAMES, curated-mcp-tools.ts) contains 28 tools,
-- but 5 of them were never seeded into tool_pricing, so on the direct MCP-gateway
-- billing path they fell through to whatever default the core/billing layer applies.
-- Prices are set in the post-migration-139 (reduced) scale, matched to sibling tools:
--   * legislation DB lookups  -> $0.0001 (like get_legislation_section/structure)
--   * primary semantic search -> $0.0200 (like search_legislation; EDRSR is NOT reduced 10x)
--   * registry searches       -> $0.0005 (like openreyestr_search_entities/debtors)

INSERT INTO tool_pricing (tool_name, service, display_name, base_cost_usd, notes)
VALUES
  ('get_legislation_history',      'backend',     'Історія змін законодавчого акту',   0.00010000, 'DB-lookup, як get_legislation_section/structure'),
  ('list_legislation_editions',    'backend',     'Список редакцій законодавчого акту', 0.00010000, 'DB-lookup, мінімальна вартість'),
  ('search_court_decisions',       'backend',     'Пошук судових рішень (ЄДРСР)',       0.02000000, 'Основний семантичний/FTS пошук по ЄДРСР, як search_legislation'),
  ('search_registry',              'backend',     'Пошук по відкритих реєстрах',        0.00050000, 'Umbrella open-data пошук, як openreyestr_search_entities'),
  ('openreyestr_search_prozorro',  'openreyestr', 'Пошук закупівель Prozorro',          0.00050000, 'Реєстр закупівель, як openreyestr_search_debtors')
ON CONFLICT (tool_name) DO UPDATE SET
  base_cost_usd = EXCLUDED.base_cost_usd,
  display_name = EXCLUDED.display_name,
  notes = EXCLUDED.notes;
