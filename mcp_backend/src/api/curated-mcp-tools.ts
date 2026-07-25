/**
 * Curated MCP tool set (v2)
 *
 * The single source of truth for the small, focused tool list exposed to external
 * MCP clients (ChatGPT connector, Claude Desktop/Code). Instead of surfacing the
 * ~100+ low-level tools registered in the ToolRegistry — which makes tool selection
 * intractable for the model and can exceed client-side tool-count limits — both
 * transports advertise only this curated subset:
 *
 *   • /api/v2/mcp  (Streamable HTTP, buildMcpServerV2)
 *   • /sse         (legacy SSE transport, MCPSSEServer)
 *
 * IMPORTANT: keep this in sync with the actual handler names registered in
 * factories/tool-services.ts. Every name here must resolve to a LOCAL handler so
 * it appears in ToolRegistry.getLocalToolDefinitions() (the SSE transport only
 * lists local tools).
 */
export const V2_TOOL_NAMES = new Set<string>([
  // Legislation (6)
  'search_legislation',
  'get_legislation_section',
  'get_legislation_articles',
  'get_legislation_structure',
  'get_legislation_history',
  'list_legislation_editions',
  // Court decisions — ЄДРСР (9)
  'search_court_decisions',
  'get_court_decision',
  'get_case_documents_chain',
  'load_full_texts',
  'find_similar_fact_pattern_cases',
  'compare_practice_pro_contra',
  'count_cases_by_party',
  'check_precedent_status',
  'get_citation_graph',
  // Реєстри відкритих даних — local handler (ТМ/патенти, санкції, АМКУ, стенограми, фінзвітність)
  'search_registry',
  // Державні реєстри OpenReyestr — remote (proxied via getAllToolDefinitions on /api/v2/mcp).
  // company/EDRPOU, beneficiaries, debtors, enforcement, bankruptcy, Prozorro, sanctions, ARMA, NAZK, notaries.
  'openreyestr_get_by_edrpou',
  'openreyestr_get_entity_details',
  'openreyestr_search_entities',
  'openreyestr_search_beneficiaries',
  'openreyestr_search_debtors',
  'openreyestr_search_enforcement_proceedings',
  'openreyestr_search_bankruptcy_cases',
  'openreyestr_search_prozorro',
  'openreyestr_search_rnbo_sanctions',
  'openreyestr_search_arma_seized_assets',
  'openreyestr_search_nazk_declarations',
  'openreyestr_search_notaries',
]);
