-- Migration 106: Drop duplicate opendata tables from main DB
-- These tables are duplicated in mcp_openreyestr which has proper MCP tools.
-- No backend code references these tables — they were imported manually.
--
-- OpenReyestr equivalents:
--   opendata_notaries             -> openreyestr.notaries             (search_notaries tool)
--   opendata_court_experts        -> openreyestr.court_experts        (search_court_experts tool)
--   opendata_arbitration_managers -> openreyestr.arbitration_managers (search_arbitration_managers tool)
--   opendata_bankruptcy_cases     -> openreyestr.bankruptcy_cases     (search_bankruptcy_cases tool)

DROP TABLE IF EXISTS opendata_notaries;
DROP TABLE IF EXISTS opendata_court_experts;
DROP TABLE IF EXISTS opendata_arbitration_managers;
DROP TABLE IF EXISTS opendata_bankruptcy_cases;
