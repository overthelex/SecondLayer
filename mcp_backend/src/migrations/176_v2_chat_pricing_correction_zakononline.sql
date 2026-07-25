-- Migration 176: correct V2 chat tool prices against competitor (ZakonOnline) benchmark.
--
-- ZakonOnline API (договір, 09.01.2025) = flat per-request access to a legal-info base
-- (court decisions + legislation): 0.29 UAH/req at low volume, 0.10 UAH/req >50k/mo,
-- 3000 UAH/mo floor (=0.30 UAH/req at 10k). No business-registry product.
--
-- Strategy "premium but competitive" (rate assumption: 1 USD = 42 UAH):
--   * search/retrieval tools  -> ~1.4x ZO low-volume  => $0.010 (0.42 UAH)
--   * LLM-analysis tools       -> 4-6x ZO (value ZO cannot deliver)
--   * legislation lookups      -> lifted off the near-zero floor to $0.001 (still ~0.15x ZO)
-- Registry (openreyestr_*) tools have no ZO equivalent and are left unchanged.
--
-- See LEXAI-1836. Idempotent: re-running sets the same target values.

UPDATE tool_pricing AS tp
SET base_cost_usd = v.price,
    updated_by = 'migration_176_zakononline_benchmark',
    updated_at = NOW()
FROM (VALUES
  -- Search / retrieval: 3x ZO -> ~1.4x ZO
  ('search_court_decisions',          0.01000000::numeric),
  ('get_court_decision',              0.01000000),
  ('search_legislation',              0.01000000),
  -- LLM-analysis: trim extreme premiums to 4-6x ZO
  ('find_similar_fact_pattern_cases', 0.03000000),
  ('compare_practice_pro_contra',     0.04000000),
  -- Legislation lookups: lift off the $0.0001-0.0002 floor
  ('get_legislation_section',         0.00100000),
  ('get_legislation_articles',        0.00100000),
  ('get_legislation_structure',       0.00100000),
  ('get_legislation_history',         0.00100000),
  ('list_legislation_editions',       0.00100000)
) AS v(tool_name, price)
WHERE tp.tool_name = v.tool_name;
