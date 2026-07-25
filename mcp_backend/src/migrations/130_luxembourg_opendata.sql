-- Migration 125: Luxembourg open data
-- Sources: Centrale des Bilans (company financials), Court decisions, CSSF funds, GLEIF LEI

-- ═══════════════════════════════════════════════════════════════
-- 1. Centrale des Bilans — company annual accounts (XML dumps)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lu_company_accounts (
    id SERIAL PRIMARY KEY,
    rcs_number TEXT,
    company_name TEXT,
    fiscal_year_end DATE,
    deposit_date DATE,
    quarter TEXT,
    total_assets NUMERIC,
    total_equity NUMERIC,
    total_revenue NUMERIC,
    net_profit NUMERIC,
    employees INTEGER,
    legal_form TEXT,
    nace_code TEXT,
    address TEXT,
    raw_xml TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rcs_number, fiscal_year_end)
);

CREATE INDEX IF NOT EXISTS idx_lu_acc_rcs ON lu_company_accounts(rcs_number);
CREATE INDEX IF NOT EXISTS idx_lu_acc_name ON lu_company_accounts(company_name);
CREATE INDEX IF NOT EXISTS idx_lu_acc_year ON lu_company_accounts(fiscal_year_end);
CREATE INDEX IF NOT EXISTS idx_lu_acc_deposit ON lu_company_accounts(deposit_date);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lu_acc_fts') THEN
        CREATE INDEX idx_lu_acc_fts ON lu_company_accounts
            USING GIN (to_tsvector('simple', coalesce(company_name, '') || ' ' || coalesce(rcs_number, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Luxembourg court decisions (data.public.lu)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lu_court_decisions (
    id SERIAL PRIMARY KEY,
    resource_id TEXT UNIQUE,
    dataset_id TEXT,
    court TEXT,
    chamber TEXT,
    title TEXT,
    decision_date DATE,
    file_url TEXT,
    file_format TEXT,
    file_size INTEGER,
    full_text TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lu_court_court ON lu_court_decisions(court);
CREATE INDEX IF NOT EXISTS idx_lu_court_chamber ON lu_court_decisions(chamber);
CREATE INDEX IF NOT EXISTS idx_lu_court_date ON lu_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_lu_court_dataset ON lu_court_decisions(dataset_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lu_court_fts') THEN
        CREATE INDEX idx_lu_court_fts ON lu_court_decisions
            USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(full_text, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. CSSF regulated funds / entities
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lu_cssf_funds (
    id SERIAL PRIMARY KEY,
    fund_id TEXT,
    fund_name TEXT,
    fund_type TEXT,
    compartment_name TEXT,
    share_class TEXT,
    management_company TEXT,
    status TEXT,
    launch_date DATE,
    cssf_code TEXT,
    isin TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fund_id, compartment_name, share_class)
);

CREATE INDEX IF NOT EXISTS idx_lu_cssf_name ON lu_cssf_funds(fund_name);
CREATE INDEX IF NOT EXISTS idx_lu_cssf_type ON lu_cssf_funds(fund_type);
CREATE INDEX IF NOT EXISTS idx_lu_cssf_isin ON lu_cssf_funds(isin);
CREATE INDEX IF NOT EXISTS idx_lu_cssf_mgmt ON lu_cssf_funds(management_company);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lu_cssf_fts') THEN
        CREATE INDEX idx_lu_cssf_fts ON lu_cssf_funds
            USING GIN (to_tsvector('simple', coalesce(fund_name, '') || ' ' || coalesce(management_company, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4. GLEIF LEI — Luxembourg entities
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lu_gleif_lei (
    lei TEXT PRIMARY KEY,
    legal_name TEXT,
    legal_form TEXT,
    jurisdiction TEXT,
    entity_status TEXT,
    registration_date DATE,
    last_update DATE,
    address_line TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    parent_lei TEXT,
    ultimate_parent_lei TEXT,
    managing_lou TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lu_lei_name ON lu_gleif_lei(legal_name);
CREATE INDEX IF NOT EXISTS idx_lu_lei_status ON lu_gleif_lei(entity_status);
CREATE INDEX IF NOT EXISTS idx_lu_lei_parent ON lu_gleif_lei(parent_lei);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lu_lei_fts') THEN
        CREATE INDEX idx_lu_lei_fts ON lu_gleif_lei
            USING GIN (to_tsvector('simple', coalesce(legal_name, '') || ' ' || coalesce(lei, '')));
    END IF;
END $$;
