-- Fix FTS language: 'russian' → 'simple' for Ukrainian text
-- Russian stemmer gives incorrect morphological results for Ukrainian words
-- 'simple' config tokenizes without stemming — works correctly for both UA and RU
-- Also fixes column name mismatches between local and prod schemas

-- From 001_initial_schema.sql
DROP INDEX IF EXISTS idx_legal_entities_name;
CREATE INDEX IF NOT EXISTS idx_legal_entities_name ON legal_entities USING gin(to_tsvector('simple', name));

DROP INDEX IF EXISTS idx_individual_entrepreneurs_name;
CREATE INDEX IF NOT EXISTS idx_individual_entrepreneurs_name ON individual_entrepreneurs USING gin(to_tsvector('simple', name));

DROP INDEX IF EXISTS idx_public_associations_name;
CREATE INDEX IF NOT EXISTS idx_public_associations_name ON public_associations USING gin(to_tsvector('simple', name));

-- From 003_add_notaries_experts_arbitration.sql (prod uses full_name, not name)
DROP INDEX IF EXISTS idx_notaries_name;
DO $$ BEGIN
  CREATE INDEX idx_notaries_name ON notaries USING gin(to_tsvector('simple', full_name));
EXCEPTION WHEN undefined_column THEN
  CREATE INDEX IF NOT EXISTS idx_notaries_name ON notaries USING gin(to_tsvector('simple', name));
WHEN duplicate_table THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_experts_name;
DO $$ BEGIN
  CREATE INDEX idx_experts_name ON court_experts USING gin(to_tsvector('simple', full_name));
EXCEPTION WHEN undefined_column THEN
  CREATE INDEX IF NOT EXISTS idx_experts_name ON court_experts USING gin(to_tsvector('simple', name));
WHEN duplicate_table THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_arb_mgr_name;
DO $$ BEGIN
  CREATE INDEX idx_arb_mgr_name ON arbitration_managers USING gin(to_tsvector('simple', full_name));
EXCEPTION WHEN undefined_column THEN
  CREATE INDEX IF NOT EXISTS idx_arb_mgr_name ON arbitration_managers USING gin(to_tsvector('simple', name));
WHEN duplicate_table THEN NULL;
END $$;

-- From 004_add_remaining_registries.sql (prod uses method_name, not name)
DROP INDEX IF EXISTS idx_forensic_methods_name;
DO $$ BEGIN
  CREATE INDEX idx_forensic_methods_name ON forensic_methods USING gin(to_tsvector('simple', method_name));
EXCEPTION WHEN undefined_column THEN
  CREATE INDEX IF NOT EXISTS idx_forensic_methods_name ON forensic_methods USING gin(to_tsvector('simple', name));
WHEN duplicate_table THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_bankruptcy_debtor;
CREATE INDEX IF NOT EXISTS idx_bankruptcy_debtor ON bankruptcy_cases USING gin(to_tsvector('simple', debtor_name));

-- legal_acts: prod uses act_title, local uses title
DROP INDEX IF EXISTS idx_legal_acts_title;
DO $$ BEGIN
  CREATE INDEX idx_legal_acts_title ON legal_acts USING gin(to_tsvector('simple', act_title));
EXCEPTION WHEN undefined_column THEN
  CREATE INDEX IF NOT EXISTS idx_legal_acts_title ON legal_acts USING gin(to_tsvector('simple', title));
WHEN duplicate_table THEN NULL;
END $$;

-- admin_units and street_codes may not exist on prod
DO $$ BEGIN
  DROP INDEX IF EXISTS idx_admin_units_name;
  CREATE INDEX idx_admin_units_name ON admin_units USING gin(to_tsvector('simple', name));
EXCEPTION WHEN undefined_table THEN NULL;
WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP INDEX IF EXISTS idx_streets_name;
  CREATE INDEX idx_streets_name ON street_codes USING gin(to_tsvector('simple', street_name));
EXCEPTION WHEN undefined_table THEN NULL;
WHEN duplicate_table THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_enforce_debtor;
CREATE INDEX IF NOT EXISTS idx_enforce_debtor ON enforcement_proceedings USING gin(to_tsvector('simple', debtor_name));

DROP INDEX IF EXISTS idx_debtors_name;
CREATE INDEX IF NOT EXISTS idx_debtors_name ON debtors USING gin(to_tsvector('simple', debtor_name));

-- From 007_add_creditor_name_fts_index.sql
DROP INDEX IF EXISTS idx_enforce_creditor;
CREATE INDEX IF NOT EXISTS idx_enforce_creditor ON enforcement_proceedings USING gin(to_tsvector('simple', creditor_name));

-- From 009_due_diligence_tables.sql
DROP INDEX IF EXISTS idx_arma_assets_owner_name;
CREATE INDEX IF NOT EXISTS idx_arma_assets_owner_name ON arma_assets USING gin(to_tsvector('simple', owner_name));

DROP INDEX IF EXISTS idx_nazk_declarations_name;
CREATE INDEX IF NOT EXISTS idx_nazk_declarations_name ON nazk_declarations USING gin(to_tsvector('simple', declarant_name));

-- nazk_declarations: prod uses declarant_workplace, local uses workplace
DROP INDEX IF EXISTS idx_nazk_declarations_workplace;
DO $$ BEGIN
  CREATE INDEX idx_nazk_declarations_workplace ON nazk_declarations USING gin(to_tsvector('simple', declarant_workplace));
EXCEPTION WHEN undefined_column THEN
  CREATE INDEX IF NOT EXISTS idx_nazk_declarations_workplace ON nazk_declarations USING gin(to_tsvector('simple', workplace));
WHEN duplicate_table THEN NULL;
END $$;

-- From 010_rnbo_sanctions_and_prozorro.sql
DROP INDEX IF EXISTS idx_rnbo_sanctions_name;
CREATE INDEX IF NOT EXISTS idx_rnbo_sanctions_name ON rnbo_sanctions USING gin(to_tsvector('simple', name));

DROP INDEX IF EXISTS idx_rnbo_sanctions_aliases;
CREATE INDEX IF NOT EXISTS idx_rnbo_sanctions_aliases ON rnbo_sanctions USING gin(to_tsvector('simple', aliases));

DROP INDEX IF EXISTS idx_prozorro_buyer_name;
CREATE INDEX IF NOT EXISTS idx_prozorro_buyer_name ON prozorro_tenders USING gin(to_tsvector('simple', buyer_name));
