-- Migration 102: Intellectual Property (UIPV/NIPO) and Securities (НКЦПФР) tables
-- Sources: sis.nipo.gov.ua (trademarks, patents), nssmc.gov.ua (major shareholders)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Trademarks (Торговельні марки)
-- Source: sis.nipo.gov.ua/api/v1/open-data/?obj_type=4 — ~605K records
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_trademarks (
    id                  BIGSERIAL PRIMARY KEY,
    app_number          TEXT NOT NULL,
    app_date            DATE,
    registration_number TEXT,
    registration_date   DATE,
    expiry_date         DATE,
    mark_text           TEXT,
    holder_name         TEXT,
    holder_edrpou       TEXT,
    holder_country      TEXT,
    applicant_name      TEXT,
    applicant_edrpou    TEXT,
    nice_classes        INTEGER[],
    nice_descriptions   TEXT,
    status              TEXT,
    last_update         TIMESTAMP WITH TIME ZONE,
    raw_data            JSONB,
    imported_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trademarks_app_number ON opendata_trademarks(app_number);
CREATE INDEX IF NOT EXISTS idx_trademarks_reg_number ON opendata_trademarks(registration_number);
CREATE INDEX IF NOT EXISTS idx_trademarks_holder_name ON opendata_trademarks(holder_name);
CREATE INDEX IF NOT EXISTS idx_trademarks_holder_edrpou ON opendata_trademarks(holder_edrpou);
CREATE INDEX IF NOT EXISTS idx_trademarks_mark_text ON opendata_trademarks USING gin(to_tsvector('simple', coalesce(mark_text, '')));
CREATE INDEX IF NOT EXISTS idx_trademarks_nice_classes ON opendata_trademarks USING gin(nice_classes);
CREATE INDEX IF NOT EXISTS idx_trademarks_expiry ON opendata_trademarks(expiry_date);
CREATE INDEX IF NOT EXISTS idx_trademarks_status ON opendata_trademarks(status);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Patents & Inventions (Винаходи, корисні моделі, промислові зразки)
-- Source: sis.nipo.gov.ua/api/v1/open-data/?obj_type=1,2,6 — ~430K records
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_patents (
    id                  BIGSERIAL PRIMARY KEY,
    obj_type            SMALLINT NOT NULL,  -- 1=invention, 2=utility_model, 6=design
    obj_type_name       TEXT,
    app_number          TEXT NOT NULL,
    app_date            DATE,
    registration_number TEXT,
    registration_date   DATE,
    title_ua            TEXT,
    title_en            TEXT,
    abstract_ua         TEXT,
    ipc_codes           TEXT[],
    owner_name          TEXT,
    owner_country       TEXT,
    inventor_names      TEXT[],
    status              TEXT,
    last_update         TIMESTAMP WITH TIME ZONE,
    raw_data            JSONB,
    imported_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patents_app_number_type ON opendata_patents(app_number, obj_type);
CREATE INDEX IF NOT EXISTS idx_patents_reg_number ON opendata_patents(registration_number);
CREATE INDEX IF NOT EXISTS idx_patents_title ON opendata_patents USING gin(to_tsvector('simple', coalesce(title_ua, '')));
CREATE INDEX IF NOT EXISTS idx_patents_owner ON opendata_patents(owner_name);
CREATE INDEX IF NOT EXISTS idx_patents_ipc ON opendata_patents USING gin(ipc_codes);
CREATE INDEX IF NOT EXISTS idx_patents_obj_type ON opendata_patents(obj_type);
CREATE INDEX IF NOT EXISTS idx_patents_status ON opendata_patents(status);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Major Shareholders (Власники значних пакетів акцій, 5%+)
-- Source: nssmc.gov.ua/api/owners — quarterly, ~thousands per quarter
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_securities_owners (
    id                  BIGSERIAL PRIMARY KEY,
    report_date         DATE NOT NULL,
    issuer_edrpou       TEXT NOT NULL,
    issuer_name         TEXT,
    isin_code           TEXT,
    owner_edrpou        TEXT,
    owner_name          TEXT,
    owner_name_alt      TEXT,
    owner_type          TEXT,
    share_percent       NUMERIC(10, 4),
    nominal_value       NUMERIC(18, 2),
    share_count         BIGINT,
    country_code        INTEGER,
    raw_data            JSONB,
    imported_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sec_owners_unique
    ON opendata_securities_owners(report_date, issuer_edrpou, coalesce(owner_edrpou, ''), coalesce(owner_name, ''));
CREATE INDEX IF NOT EXISTS idx_sec_owners_issuer ON opendata_securities_owners(issuer_edrpou);
CREATE INDEX IF NOT EXISTS idx_sec_owners_owner ON opendata_securities_owners(owner_edrpou);
CREATE INDEX IF NOT EXISTS idx_sec_owners_issuer_name ON opendata_securities_owners(issuer_name);
CREATE INDEX IF NOT EXISTS idx_sec_owners_owner_name ON opendata_securities_owners(owner_name);
CREATE INDEX IF NOT EXISTS idx_sec_owners_report ON opendata_securities_owners(report_date);
CREATE INDEX IF NOT EXISTS idx_sec_owners_isin ON opendata_securities_owners(isin_code);
