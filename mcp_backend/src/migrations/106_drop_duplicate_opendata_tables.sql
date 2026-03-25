-- Migration 106: Drop duplicate opendata tables from main DB
-- These tables are duplicated in mcp_openreyestr which has proper MCP tools.
-- No backend code references these tables — they were imported manually.
--
-- OpenReyestr equivalents (OpenReyestr is better or equal):
--   opendata_notaries             -> openreyestr.notaries                (5812 > 5799, richer schema)
--   opendata_arbitration_managers -> openreyestr.arbitration_managers    (equal 3420, richer schema)
--   opendata_enforcement          -> openreyestr.enforcement_proceedings (equal 29M, richer schema)
--   opendata_tax_debt             -> openreyestr.tax_debt               (861K vs 1 row)
--   opendata_sanctions_dsfmu      -> openreyestr.rnbo_sanctions          (21K vs 2 rows)
--   opendata_arma_assets          -> openreyestr.arma_assets             (725K, structured fields)
--
-- KEPT in backend (more data than openreyestr):
--   opendata_court_experts   (79K vs 22K in openreyestr)  → search_court_experts tool in backend
--   opendata_vat_payers      (263K vs 131K in openreyestr) → search_vat_payers tool in backend
--
-- Bankruptcy: different datasets (backend=auctions 74K, openreyestr=cases 35K) → kept both

DROP TABLE IF EXISTS opendata_notaries;
DROP TABLE IF EXISTS opendata_arbitration_managers;
DROP TABLE IF EXISTS opendata_enforcement;
DROP TABLE IF EXISTS opendata_tax_debt;
DROP TABLE IF EXISTS opendata_sanctions_dsfmu;
DROP TABLE IF EXISTS opendata_arma_assets;
