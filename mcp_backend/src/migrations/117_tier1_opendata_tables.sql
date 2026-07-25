-- Migration 117: TIER 1 open data tables from data.gov.ua audit (27.03.2026)
-- Sources: МВС (passports, vehicles, weapons), ДСФМУ (terrorism), Мін'юст (lustration),
--          АМКУ (state aid), Держстат (financial statements)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Invalid passports (Недійсні паспорти громадянина України)
-- Source: data.gov.ua/dataset/ab09ed00 — ~2.9M records
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_invalid_passports (
    id              TEXT PRIMARY KEY,  -- e.g. "0101_AP_098559"
    ovd             TEXT,              -- issuing authority
    d_series        TEXT,              -- passport series
    d_number        TEXT,              -- passport number
    d_type          TEXT,              -- document type
    d_status        TEXT,              -- status (ВТРАЧЕНО, ВИКРАДЕНО, etc.)
    theft_date      DATE,              -- date of theft/loss
    insert_date     DATE,              -- date inserted into registry
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invalid_passports_series_number ON opendata_invalid_passports(d_series, d_number);
CREATE INDEX IF NOT EXISTS idx_invalid_passports_status ON opendata_invalid_passports(d_status);
CREATE INDEX IF NOT EXISTS idx_invalid_passports_ovd ON opendata_invalid_passports USING gin(to_tsvector('simple', coalesce(ovd, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Invalid foreign passports (Недійсні закордонні паспорти)
-- Source: data.gov.ua/dataset/b465b821 — ~200K records
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_invalid_passports_foreign (
    id              TEXT PRIMARY KEY,
    ovd             TEXT,
    d_series        TEXT,
    d_number        TEXT,
    d_type          TEXT,
    d_status        TEXT,
    theft_date      DATE,
    insert_date     DATE,
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invalid_passports_foreign_sn ON opendata_invalid_passports_foreign(d_series, d_number);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Vehicle registrations (Реєстрація ТЗ та власники)
-- Source: data.gov.ua/dataset/06779371 — millions of records per year
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_vehicle_registrations (
    id              BIGSERIAL PRIMARY KEY,
    person_type     TEXT,              -- P=physical, J=juridical
    reg_addr_koatuu TEXT,              -- KOATUU code of registration address
    oper_code       TEXT,              -- operation code
    oper_name       TEXT,              -- operation name
    d_reg           DATE,              -- registration date
    dep_code        TEXT,              -- service center code
    dep             TEXT,              -- service center name
    brand           TEXT,
    model           TEXT,
    vin             TEXT,
    make_year       INT,
    color           TEXT,
    kind            TEXT,              -- vehicle kind (ЛЕГКОВИЙ, etc.)
    body            TEXT,              -- body type
    purpose         TEXT,              -- purpose (ЗАГАЛЬНИЙ, etc.)
    fuel            TEXT,              -- fuel type
    capacity        INT,               -- engine capacity
    own_weight      INT,
    total_weight    INT,
    n_reg_new       TEXT,              -- license plate
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON opendata_vehicle_registrations(vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON opendata_vehicle_registrations(n_reg_new);
CREATE INDEX IF NOT EXISTS idx_vehicles_brand_model ON opendata_vehicle_registrations(brand, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_d_reg ON opendata_vehicle_registrations(d_reg);
CREATE INDEX IF NOT EXISTS idx_vehicles_koatuu ON opendata_vehicle_registrations(reg_addr_koatuu);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. DSFMU terrorism list (Перелік осіб пов'язаних з тероризмом)
-- Source: data.gov.ua/dataset/a140de93
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_terrorism_persons (
    id              SERIAL PRIMARY KEY,
    row_data        JSONB NOT NULL,    -- raw row from XLSX as JSON
    name_ua         TEXT,
    name_en         TEXT,
    doc_type        TEXT,
    sanctions_type  TEXT,
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terrorism_name_ua ON opendata_terrorism_persons USING gin(to_tsvector('simple', coalesce(name_ua, '')));
CREATE INDEX IF NOT EXISTS idx_terrorism_name_en ON opendata_terrorism_persons USING gin(to_tsvector('simple', coalesce(name_en, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Terrorism organizations (Перелік терористичних організацій)
-- Source: data.gov.ua/dataset/pereliktog — ~11 records
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_terrorism_orgs (
    id              SERIAL PRIMARY KEY,
    name_ua         TEXT,
    name_ua_short   TEXT,
    name_en         TEXT,
    head_name_ua    TEXT,
    head_name_en    TEXT,
    head_dob        TEXT,
    org_country     TEXT,
    report_date     TEXT,
    report_num      TEXT,
    raw_data        JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Lustration registry (Реєстр люстрованих осіб)
-- Source: data.gov.ua/dataset/8faa71c1
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_lustration (
    id              SERIAL PRIMARY KEY,
    fio             TEXT NOT NULL,
    job             TEXT,
    judgment        TEXT,              -- legal basis
    period          TEXT,              -- ban period
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lustration_fio ON opendata_lustration USING gin(to_tsvector('simple', coalesce(fio, '')));
CREATE INDEX IF NOT EXISTS idx_lustration_job ON opendata_lustration USING gin(to_tsvector('simple', coalesce(job, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 7. State aid registry (Реєстр держдопомоги АМКУ)
-- Source: data.gov.ua/dataset/16fcf128
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_state_aid (
    id              SERIAL PRIMARY KEY,
    row_data        JSONB NOT NULL,    -- raw row from XLSX
    provider_edrpou TEXT,
    provider_name   TEXT,
    recipient_edrpou TEXT,
    recipient_name  TEXT,
    program_name    TEXT,
    decision_date   DATE,
    amount          NUMERIC,
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_state_aid_provider ON opendata_state_aid(provider_edrpou);
CREATE INDEX IF NOT EXISTS idx_state_aid_recipient ON opendata_state_aid(recipient_edrpou);
CREATE INDEX IF NOT EXISTS idx_state_aid_provider_name ON opendata_state_aid USING gin(to_tsvector('simple', coalesce(provider_name, '')));
CREATE INDEX IF NOT EXISTS idx_state_aid_recipient_name ON opendata_state_aid USING gin(to_tsvector('simple', coalesce(recipient_name, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Financial statements (Фінзвітність підприємств)
-- Source: data.gov.ua/dataset/7436ae83 — ~500K XML files
-- Individual XML records are huge; store summary per EDRPOU/year
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_financial_statements (
    id              BIGSERIAL PRIMARY KEY,
    tin             TEXT NOT NULL,      -- ЄДРПОУ / ІПН
    c_doc           TEXT,              -- document code (S01, etc.)
    c_doc_sub       TEXT,              -- sub-code
    c_doc_ver       TEXT,              -- version
    period_year     INT,
    period_month    INT,
    period_type     INT,               -- 1=month, 5=year
    c_reg           TEXT,              -- region code
    c_raj           TEXT,              -- district code
    form_type       TEXT,              -- form identifier (S0100115, etc.)
    raw_xml         TEXT,              -- full XML content
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finzvit_tin_year_form ON opendata_financial_statements(tin, period_year, form_type, c_doc_sub);
CREATE INDEX IF NOT EXISTS idx_finzvit_tin ON opendata_financial_statements(tin);
CREATE INDEX IF NOT EXISTS idx_finzvit_year ON opendata_financial_statements(period_year);
CREATE INDEX IF NOT EXISTS idx_finzvit_region ON opendata_financial_statements(c_reg);
