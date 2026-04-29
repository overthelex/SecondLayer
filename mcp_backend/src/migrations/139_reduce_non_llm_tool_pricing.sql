-- Migration 139: Reduce base_cost_usd by 10x for non-LLM / non-EDRSR / non-upload tools.
-- Already applied to prod DB on 2026-04-29; this migration codifies the change so
-- fresh setups (local dev, new envs) match prod after running 053/107/108.

UPDATE tool_pricing SET base_cost_usd = ROUND(base_cost_usd / 10.0, 8)
WHERE tool_name IN (
  -- Legislation retrieval (DB lookups)
  'get_legislation_article',
  'get_legislation_articles',
  'get_legislation_section',
  'get_legislation_structure',
  'find_relevant_law_articles',
  'search_procedural_norms',
  -- Calculators (pure compute)
  'calculate_monetary_claims',
  'calculate_procedural_deadlines',
  -- Open-data registries (backend, DB lookups)
  'search_case_distribution',
  'search_court_experts_registry',
  'search_declaration_checks',
  'search_judges',
  'search_large_taxpayers',
  'search_missing_persons',
  'search_public_organizations',
  'search_securities_owners',
  'search_vat_payers_registry',
  'search_vkks',
  'search_vrp_decisions',
  'search_vrp_judges_discipline',
  'search_wage_debtors',
  'search_wanted_persons',
  'search_wanted_vehicles',
  -- OpenReyestr (registry lookups)
  'openreyestr_get_by_edrpou',
  'openreyestr_get_entity_details',
  'openreyestr_get_statistics',
  'openreyestr_search_administrative_units',
  'openreyestr_search_arbitration_managers',
  'openreyestr_search_arma_seized_assets',
  'openreyestr_search_bankruptcy_cases',
  'openreyestr_search_beneficiaries',
  'openreyestr_search_court_experts',
  'openreyestr_search_debtors',
  'openreyestr_search_enforcement_proceedings',
  'openreyestr_search_entities',
  'openreyestr_search_exchange_data',
  'openreyestr_search_forensic_methods',
  'openreyestr_search_legal_acts',
  'openreyestr_search_nazk_declarations',
  'openreyestr_search_notaries',
  'openreyestr_search_rnbo_sanctions',
  'openreyestr_search_special_forms',
  'openreyestr_search_streets',
  'openreyestr_search_termination_started',
  -- RADA (parliament data)
  'rada_analyze_voting_record',
  'rada_get_deputy_info',
  'rada_search_legislation_text',
  'rada_search_parliament_bills'
)
-- Idempotency guard: skip if already at the reduced price (e.g., applied previously on prod).
AND base_cost_usd > (
  CASE tool_name
    WHEN 'calculate_monetary_claims'                  THEN 0.0005
    WHEN 'calculate_procedural_deadlines'             THEN 0.005
    WHEN 'find_relevant_law_articles'                 THEN 0.0015
    WHEN 'get_legislation_article'                    THEN 0.0001
    WHEN 'get_legislation_articles'                   THEN 0.0002
    WHEN 'get_legislation_section'                    THEN 0.0001
    WHEN 'get_legislation_structure'                  THEN 0.0001
    WHEN 'search_procedural_norms'                    THEN 0.0015
    WHEN 'search_case_distribution'                   THEN 0.0003
    WHEN 'search_court_experts_registry'              THEN 0.0003
    WHEN 'search_declaration_checks'                  THEN 0.0003
    WHEN 'search_judges'                              THEN 0.0003
    WHEN 'search_large_taxpayers'                     THEN 0.0001
    WHEN 'search_missing_persons'                     THEN 0.0003
    WHEN 'search_public_organizations'                THEN 0.0003
    WHEN 'search_securities_owners'                   THEN 0.0003
    WHEN 'search_vat_payers_registry'                 THEN 0.0001
    WHEN 'search_vkks'                                THEN 0.0003
    WHEN 'search_vrp_decisions'                       THEN 0.0003
    WHEN 'search_vrp_judges_discipline'               THEN 0.0003
    WHEN 'search_wage_debtors'                        THEN 0.0003
    WHEN 'search_wanted_persons'                      THEN 0.0003
    WHEN 'search_wanted_vehicles'                     THEN 0.0003
    WHEN 'openreyestr_get_by_edrpou'                  THEN 0.0003
    WHEN 'openreyestr_get_entity_details'             THEN 0.0003
    WHEN 'openreyestr_get_statistics'                 THEN 0.0001
    WHEN 'openreyestr_search_administrative_units'    THEN 0.0001
    WHEN 'openreyestr_search_arbitration_managers'    THEN 0.0003
    WHEN 'openreyestr_search_arma_seized_assets'      THEN 0.0003
    WHEN 'openreyestr_search_bankruptcy_cases'        THEN 0.0005
    WHEN 'openreyestr_search_beneficiaries'           THEN 0.0005
    WHEN 'openreyestr_search_court_experts'           THEN 0.0003
    WHEN 'openreyestr_search_debtors'                 THEN 0.0005
    WHEN 'openreyestr_search_enforcement_proceedings' THEN 0.0005
    WHEN 'openreyestr_search_entities'                THEN 0.0005
    WHEN 'openreyestr_search_exchange_data'           THEN 0.0001
    WHEN 'openreyestr_search_forensic_methods'        THEN 0.0003
    WHEN 'openreyestr_search_legal_acts'              THEN 0.0003
    WHEN 'openreyestr_search_nazk_declarations'       THEN 0.0003
    WHEN 'openreyestr_search_notaries'                THEN 0.0003
    WHEN 'openreyestr_search_rnbo_sanctions'          THEN 0.0003
    WHEN 'openreyestr_search_special_forms'           THEN 0.0003
    WHEN 'openreyestr_search_streets'                 THEN 0.0001
    WHEN 'openreyestr_search_termination_started'     THEN 0.0003
    WHEN 'rada_analyze_voting_record'                 THEN 0.002
    WHEN 'rada_get_deputy_info'                       THEN 0.0005
    WHEN 'rada_search_legislation_text'               THEN 0.0015
    WHEN 'rada_search_parliament_bills'               THEN 0.001
  END
);
