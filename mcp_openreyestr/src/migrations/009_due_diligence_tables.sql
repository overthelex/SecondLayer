-- Migration 009: Due Diligence tables (ARMA seized assets, NAZK declarations)

-- ARMA: Єдиний державний реєстр активів, на які накладено арешт у кримінальному провадженні
CREATE TABLE IF NOT EXISTS arma_assets (
    id SERIAL PRIMARY KEY,
    case_number TEXT,
    case_date DATE,
    court_name TEXT,
    asset_type TEXT,
    asset_description TEXT,
    owner_name TEXT,
    owner_type TEXT,           -- individual / legal
    owner_edrpou TEXT,
    region TEXT,
    status TEXT,               -- arrested / transferred / returned
    arrest_date DATE,
    transfer_date DATE,
    manager TEXT,              -- who manages the asset
    raw_data JSONB NOT NULL,
    source_url TEXT,
    content_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_arma_assets_owner_name ON arma_assets USING gin(to_tsvector('russian', owner_name));
CREATE INDEX IF NOT EXISTS idx_arma_assets_owner_edrpou ON arma_assets(owner_edrpou) WHERE owner_edrpou IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arma_assets_case_number ON arma_assets(case_number) WHERE case_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arma_assets_status ON arma_assets(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_arma_assets_content_hash ON arma_assets(content_hash);

-- NAZK: Декларації осіб, уповноважених на виконання функцій держави
CREATE TABLE IF NOT EXISTS nazk_declarations (
    id SERIAL PRIMARY KEY,
    declaration_id TEXT NOT NULL UNIQUE,
    declarant_id INTEGER,
    declaration_type INTEGER,       -- 1=annual, 2=before dismissal, 3=after dismissal, 4=candidate
    declaration_year INTEGER,
    declarant_name TEXT NOT NULL,
    declarant_position TEXT,
    declarant_workplace TEXT,
    declarant_region TEXT,
    post_type TEXT,
    post_category TEXT,
    corruption_affected BOOLEAN DEFAULT FALSE,
    submission_date TIMESTAMP,
    has_real_estate BOOLEAN DEFAULT FALSE,
    has_vehicles BOOLEAN DEFAULT FALSE,
    has_securities BOOLEAN DEFAULT FALSE,
    has_corporate_rights BOOLEAN DEFAULT FALSE,
    has_income BOOLEAN DEFAULT FALSE,
    total_income_declared NUMERIC(15,2),
    raw_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nazk_declarations_name ON nazk_declarations USING gin(to_tsvector('russian', declarant_name));
CREATE INDEX IF NOT EXISTS idx_nazk_declarations_declarant_id ON nazk_declarations(declarant_id);
CREATE INDEX IF NOT EXISTS idx_nazk_declarations_year ON nazk_declarations(declaration_year);
CREATE INDEX IF NOT EXISTS idx_nazk_declarations_type ON nazk_declarations(declaration_type);
CREATE INDEX IF NOT EXISTS idx_nazk_declarations_workplace ON nazk_declarations USING gin(to_tsvector('russian', declarant_workplace));
