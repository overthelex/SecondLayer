-- Migration 010: RNBO sanctions + Prozorro tenders

-- RNBO sanctions (from OpenSanctions ua_nsdc_sanctions)
CREATE TABLE IF NOT EXISTS rnbo_sanctions (
    id SERIAL PRIMARY KEY,
    entity_id TEXT NOT NULL UNIQUE,
    schema_type TEXT,
    name TEXT NOT NULL,
    aliases TEXT,
    birth_date TEXT,
    countries TEXT,
    addresses TEXT,
    identifiers TEXT,
    sanctions TEXT,
    phones TEXT,
    emails TEXT,
    program_ids TEXT,
    dataset TEXT,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    last_change TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rnbo_sanctions_name ON rnbo_sanctions USING gin(to_tsvector('russian', name));
CREATE INDEX IF NOT EXISTS idx_rnbo_sanctions_aliases ON rnbo_sanctions USING gin(to_tsvector('russian', aliases)) WHERE aliases IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rnbo_sanctions_schema ON rnbo_sanctions(schema_type);
CREATE INDEX IF NOT EXISTS idx_rnbo_sanctions_countries ON rnbo_sanctions(countries);

-- Prozorro public procurement tenders (metadata only)
CREATE TABLE IF NOT EXISTS prozorro_tenders (
    id SERIAL PRIMARY KEY,
    tender_id TEXT NOT NULL UNIQUE,        -- Prozorro UUID
    tender_number TEXT,                     -- UA-2024-01-01-000001
    title TEXT,
    status TEXT,                            -- active, complete, cancelled, unsuccessful
    procurement_method TEXT,                -- open, limited, selective
    procurement_method_type TEXT,           -- belowThreshold, aboveThreshold, etc.
    buyer_name TEXT,
    buyer_edrpou TEXT,
    buyer_region TEXT,
    amount NUMERIC(15,2),
    currency TEXT DEFAULT 'UAH',
    cpv_code TEXT,                          -- CPV classification
    cpv_description TEXT,
    date_created TIMESTAMP,
    date_modified TIMESTAMP,
    tender_start DATE,
    tender_end DATE,
    award_criteria TEXT,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prozorro_tender_number ON prozorro_tenders(tender_number);
CREATE INDEX IF NOT EXISTS idx_prozorro_buyer_name ON prozorro_tenders USING gin(to_tsvector('russian', buyer_name)) WHERE buyer_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prozorro_buyer_edrpou ON prozorro_tenders(buyer_edrpou) WHERE buyer_edrpou IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prozorro_status ON prozorro_tenders(status);
CREATE INDEX IF NOT EXISTS idx_prozorro_cpv ON prozorro_tenders(cpv_code);
CREATE INDEX IF NOT EXISTS idx_prozorro_amount ON prozorro_tenders(amount);
CREATE INDEX IF NOT EXISTS idx_prozorro_date_created ON prozorro_tenders(date_created);
CREATE INDEX IF NOT EXISTS idx_prozorro_date_modified ON prozorro_tenders(date_modified);
