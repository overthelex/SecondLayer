-- Migration 124: Offshore jurisdictions open data
-- Sources: Netherlands (Rechtspraak, DNB, AFM), Switzerland (Zefix, SHAB, FINMA),
--          Ireland (CRO, Property Prices, Central Bank), ICIJ Offshore Leaks

-- ═══════════════════════════════════════════════════════════════
-- 1. Netherlands — Rechtspraak court decisions (500K+)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nl_rechtspraak_decisions (
    ecli TEXT PRIMARY KEY,
    case_number TEXT,
    court_code TEXT,
    court_name TEXT,
    decision_date DATE,
    decision_type TEXT,
    procedure_type TEXT,
    subject_areas TEXT[],
    parties TEXT,
    summary TEXT,
    full_text TEXT,
    full_text_xml TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nl_recht_court ON nl_rechtspraak_decisions(court_code);
CREATE INDEX IF NOT EXISTS idx_nl_recht_date ON nl_rechtspraak_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_nl_recht_type ON nl_rechtspraak_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_nl_recht_procedure ON nl_rechtspraak_decisions(procedure_type);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nl_recht_fts') THEN
        CREATE INDEX idx_nl_recht_fts ON nl_rechtspraak_decisions
            USING GIN (to_tsvector('simple', coalesce(parties, '') || ' ' || coalesce(full_text, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Netherlands — DNB regulated entities
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nl_dnb_regulated_entities (
    id SERIAL PRIMARY KEY,
    entity_name TEXT NOT NULL,
    trade_name TEXT,
    license_type TEXT,
    license_number TEXT,
    lei_code TEXT,
    address TEXT,
    registration_number TEXT,
    status TEXT,
    country TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_name, license_type)
);

CREATE INDEX IF NOT EXISTS idx_nl_dnb_name ON nl_dnb_regulated_entities(entity_name);
CREATE INDEX IF NOT EXISTS idx_nl_dnb_license ON nl_dnb_regulated_entities(license_type);
CREATE INDEX IF NOT EXISTS idx_nl_dnb_regno ON nl_dnb_regulated_entities(registration_number);

-- ═══════════════════════════════════════════════════════════════
-- 3. Netherlands — AFM registers
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nl_afm_registers (
    id SERIAL PRIMARY KEY,
    entity_name TEXT NOT NULL,
    register_type TEXT,
    registration_number TEXT,
    status TEXT,
    address TEXT,
    effective_date DATE,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_name, register_type)
);

CREATE INDEX IF NOT EXISTS idx_nl_afm_name ON nl_afm_registers(entity_name);
CREATE INDEX IF NOT EXISTS idx_nl_afm_type ON nl_afm_registers(register_type);

-- ═══════════════════════════════════════════════════════════════
-- 4. Netherlands — Insolventieregister
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nl_insolvency (
    id SERIAL PRIMARY KEY,
    case_number TEXT,
    court_code TEXT,
    debtor_name TEXT,
    debtor_type TEXT,
    insolvency_type TEXT,
    publication_date DATE,
    status TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(case_number, court_code)
);

CREATE INDEX IF NOT EXISTS idx_nl_insol_name ON nl_insolvency(debtor_name);
CREATE INDEX IF NOT EXISTS idx_nl_insol_date ON nl_insolvency(publication_date);
CREATE INDEX IF NOT EXISTS idx_nl_insol_type ON nl_insolvency(insolvency_type);

-- ═══════════════════════════════════════════════════════════════
-- 5. Switzerland — Zefix company registry (~900K)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ch_zefix_companies (
    uid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legal_form TEXT,
    legal_seat TEXT,
    register_office TEXT,
    status TEXT,
    purpose TEXT,
    capital NUMERIC,
    capital_currency TEXT,
    address TEXT,
    canton TEXT,
    chid TEXT,
    ehraid INTEGER,
    shab_pub_date DATE,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_zefix_name ON ch_zefix_companies(name);
CREATE INDEX IF NOT EXISTS idx_ch_zefix_canton ON ch_zefix_companies(canton);
CREATE INDEX IF NOT EXISTS idx_ch_zefix_form ON ch_zefix_companies(legal_form);
CREATE INDEX IF NOT EXISTS idx_ch_zefix_status ON ch_zefix_companies(status);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ch_zefix_fts') THEN
        CREATE INDEX idx_ch_zefix_fts ON ch_zefix_companies
            USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(purpose, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 6. Switzerland — SHAB gazette publications
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ch_shab_publications (
    id SERIAL PRIMARY KEY,
    shab_id TEXT UNIQUE,
    publication_date DATE,
    publication_type TEXT,
    rubric TEXT,
    sub_rubric TEXT,
    company_uid TEXT,
    company_name TEXT,
    canton TEXT,
    content TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_shab_date ON ch_shab_publications(publication_date);
CREATE INDEX IF NOT EXISTS idx_ch_shab_uid ON ch_shab_publications(company_uid);
CREATE INDEX IF NOT EXISTS idx_ch_shab_type ON ch_shab_publications(publication_type);

-- ═══════════════════════════════════════════════════════════════
-- 7. Switzerland — FINMA regulated entities
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ch_finma_regulated (
    id SERIAL PRIMARY KEY,
    entity_name TEXT NOT NULL,
    authorization_type TEXT,
    authorization_number TEXT,
    status TEXT,
    city TEXT,
    canton TEXT,
    country TEXT,
    effective_date DATE,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_name, authorization_type)
);

CREATE INDEX IF NOT EXISTS idx_ch_finma_name ON ch_finma_regulated(entity_name);
CREATE INDEX IF NOT EXISTS idx_ch_finma_type ON ch_finma_regulated(authorization_type);

-- ═══════════════════════════════════════════════════════════════
-- 8. Ireland — CRO companies
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ie_cro_companies (
    company_number TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    company_type TEXT,
    status TEXT,
    registration_date DATE,
    address TEXT,
    activity_code TEXT,
    last_annual_return_date DATE,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ie_cro_name ON ie_cro_companies(company_name);
CREATE INDEX IF NOT EXISTS idx_ie_cro_status ON ie_cro_companies(status);
CREATE INDEX IF NOT EXISTS idx_ie_cro_type ON ie_cro_companies(company_type);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ie_cro_fts') THEN
        CREATE INDEX idx_ie_cro_fts ON ie_cro_companies
            USING GIN (to_tsvector('english', coalesce(company_name, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 9. Ireland — Property Price Register
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ie_property_prices (
    id SERIAL PRIMARY KEY,
    sale_date DATE,
    address TEXT,
    address_hash TEXT,
    county TEXT,
    price NUMERIC,
    not_full_market_price BOOLEAN DEFAULT FALSE,
    vat_exclusive BOOLEAN DEFAULT FALSE,
    property_description TEXT,
    property_size TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sale_date, address_hash)
);

CREATE INDEX IF NOT EXISTS idx_ie_prop_date ON ie_property_prices(sale_date);
CREATE INDEX IF NOT EXISTS idx_ie_prop_county ON ie_property_prices(county);
CREATE INDEX IF NOT EXISTS idx_ie_prop_price ON ie_property_prices(price);

-- ═══════════════════════════════════════════════════════════════
-- 10. Ireland — Central Bank registers
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ie_central_bank_registers (
    id SERIAL PRIMARY KEY,
    entity_name TEXT NOT NULL,
    register_type TEXT,
    reference_number TEXT,
    status TEXT,
    country TEXT,
    address TEXT,
    authorization_date DATE,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_name, register_type)
);

CREATE INDEX IF NOT EXISTS idx_ie_cb_name ON ie_central_bank_registers(entity_name);
CREATE INDEX IF NOT EXISTS idx_ie_cb_type ON ie_central_bank_registers(register_type);

-- ═══════════════════════════════════════════════════════════════
-- 11. ICIJ Offshore Leaks — entities
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS icij_entities (
    node_id TEXT PRIMARY KEY,
    name TEXT,
    jurisdiction TEXT,
    jurisdiction_description TEXT,
    incorporation_date DATE,
    inactivation_date DATE,
    struck_off_date DATE,
    status TEXT,
    service_provider TEXT,
    country_codes TEXT[],
    source_id TEXT,
    address TEXT,
    note TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icij_ent_name ON icij_entities(name);
CREATE INDEX IF NOT EXISTS idx_icij_ent_jurisdiction ON icij_entities(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_icij_ent_status ON icij_entities(status);
CREATE INDEX IF NOT EXISTS idx_icij_ent_source ON icij_entities(source_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_icij_ent_fts') THEN
        CREATE INDEX idx_icij_ent_fts ON icij_entities
            USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(address, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 12. ICIJ Offshore Leaks — officers
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS icij_officers (
    node_id TEXT PRIMARY KEY,
    name TEXT,
    country_codes TEXT[],
    source_id TEXT,
    note TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icij_off_name ON icij_officers(name);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_icij_off_fts') THEN
        CREATE INDEX idx_icij_off_fts ON icij_officers
            USING GIN (to_tsvector('simple', coalesce(name, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 13. ICIJ Offshore Leaks — intermediaries
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS icij_intermediaries (
    node_id TEXT PRIMARY KEY,
    name TEXT,
    country_codes TEXT[],
    status TEXT,
    source_id TEXT,
    address TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icij_int_name ON icij_intermediaries(name);

-- ═══════════════════════════════════════════════════════════════
-- 14. ICIJ Offshore Leaks — addresses
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS icij_addresses (
    node_id TEXT PRIMARY KEY,
    address TEXT,
    country_codes TEXT[],
    source_id TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icij_addr_country ON icij_addresses USING GIN (country_codes);

-- ═══════════════════════════════════════════════════════════════
-- 15. ICIJ Offshore Leaks — relationships (edges)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS icij_relationships (
    id SERIAL PRIMARY KEY,
    node_id_start TEXT NOT NULL,
    node_id_end TEXT NOT NULL,
    rel_type TEXT,
    link TEXT,
    start_date DATE,
    end_date DATE,
    source_id TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(node_id_start, node_id_end, rel_type)
);

CREATE INDEX IF NOT EXISTS idx_icij_rel_start ON icij_relationships(node_id_start);
CREATE INDEX IF NOT EXISTS idx_icij_rel_end ON icij_relationships(node_id_end);
CREATE INDEX IF NOT EXISTS idx_icij_rel_type ON icij_relationships(rel_type);
