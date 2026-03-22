-- Migration 011: Tax registries from data.gov.ua (DPS)
-- VAT payers, Single tax payers, Tax debt, ESV debt

-- 1. VAT payers registry (Реєстр платників ПДВ)
CREATE TABLE IF NOT EXISTS vat_payers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    vat_code TEXT NOT NULL,
    registration_date DATE,
    termination_date DATE,
    source_file TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vat_payers_code ON vat_payers(vat_code);
CREATE INDEX IF NOT EXISTS idx_vat_payers_name_fts ON vat_payers USING gin(to_tsvector('simple', name));

-- 2. Single tax payers registry (Реєстр платників єдиного податку)
CREATE TABLE IF NOT EXISTS single_tax_payers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    tin TEXT NOT NULL,
    start_date DATE,
    rate NUMERIC,
    tax_group TEXT,
    activity_codes TEXT,
    end_date DATE,
    source_file TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_tax_tin ON single_tax_payers(tin);
CREATE INDEX IF NOT EXISTS idx_single_tax_name_fts ON single_tax_payers USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_single_tax_group ON single_tax_payers(tax_group);

-- 3. Tax debt registry (Податковий борг)
CREATE TABLE IF NOT EXISTS tax_debt (
    id SERIAL PRIMARY KEY,
    report_date DATE,
    tin TEXT NOT NULL,
    name TEXT NOT NULL,
    subsidiary_tin TEXT,
    subsidiary_name TEXT,
    chief_name TEXT,
    tax_office_code INTEGER,
    tax_office_name TEXT,
    tax_office_chief TEXT,
    tax_code INTEGER,
    tax_name TEXT,
    budget_code TEXT,
    budget_name TEXT,
    debt_total NUMERIC,
    debt_tax NUMERIC,
    debt_penalty NUMERIC,
    debt_fine NUMERIC,
    source_file TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tax_debt_tin ON tax_debt(tin);
CREATE INDEX IF NOT EXISTS idx_tax_debt_name_fts ON tax_debt USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_tax_debt_report_date ON tax_debt(report_date);

-- 4. ESV debt registry (Борг зі сплати ЄСВ)
CREATE TABLE IF NOT EXISTS esv_debt (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    tin TEXT,
    pib TEXT,
    tax_office TEXT,
    tax_office_chief TEXT,
    debt_amount NUMERIC,
    source_file TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_esv_debt_tin ON esv_debt(tin) WHERE tin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esv_debt_name_fts ON esv_debt USING gin(to_tsvector('simple', name));
