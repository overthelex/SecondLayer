-- Migration 169: Open-data tables for the M&A / antitrust / sanctions client demo (03.07.2026)
-- Sources downloaded to prod /data/opendata/ :
--   drs/            — Держреєстр санкцій РНБО (official UA sanctions registry)
--   nazk_sanctions/ — «Війна і санкції» (war-sanctions.gur.gov.ua, GUR) scrape + OpenSanctions bulk
--   amcu/           — АМКУ: рішення (decisions) + зведені відомості про спотворення торгів (bid-rigging)
--   rada_stenograms/— ВРУ plenary stenograms (legislative intent)
--
-- These sources cannot auto-sync from the prod IP (Cloudflare block / confidential API), so they are
-- loaded by standalone file importers in src/scripts/import-*.ts reading from /data/opendata/.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ДРС РНБО — official Ukrainian sanctions registry (drs.nsdc.gov.ua)
--    ~24k subjects: individuals / legal entities / vessels
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_drs_sanctions (
    subject_id      BIGINT PRIMARY KEY,            -- subjectId from the registry
    subject_type    TEXT,                          -- individual | legal | vessel
    subject_status  TEXT,                          -- active | expired | excluded
    name            TEXT,                          -- subjectName (Ukrainian)
    aliases         JSONB,                          -- subjectAliases[] (translit / ru / other)
    birth_date      DATE,                          -- subjectBirthDate (individuals)
    identifiers     JSONB,                          -- subjectIdentifiers {tax, passport, ...}
    citizenships    JSONB,                          -- subjectCitizenships[]
    attributes      JSONB,                          -- subjectAttributes
    raw_data        JSONB NOT NULL,                 -- full record
    fetched_at      TIMESTAMPTZ,                    -- when the registry snapshot was taken
    imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drs_type_status ON opendata_drs_sanctions(subject_type, subject_status);
CREATE INDEX IF NOT EXISTS idx_drs_name ON opendata_drs_sanctions USING gin(to_tsvector('simple', coalesce(name, '')));
CREATE INDEX IF NOT EXISTS idx_drs_identifiers ON opendata_drs_sanctions USING gin(identifiers);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. НАЗК/ГУР «Війна і санкції» — war-sanctions.gur.gov.ua scrape
--    14 categories: sanctions_persons/companies, ships, shadow-fleet, rostec,
--    uav_companies, propaganda, kidnappers, stolen objects/persons, etc.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_nazk_war_sanctions (
    id              BIGSERIAL PRIMARY KEY,
    category        TEXT NOT NULL,                  -- sanctions_persons, transport_ships, ...
    source_id       INTEGER,                        -- id on the portal
    url             TEXT,                           -- canonical portal URL
    page_title      TEXT,
    name_uk         TEXT,                           -- primary Ukrainian name (first of fields.Name)
    tin             TEXT,                           -- ІПН / TIN when present
    fields          JSONB,                          -- all scraped detail fields
    sanction_jurisdictions JSONB,                   -- [{jurisdiction, sanctioned, date, document_url}]
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (category, source_id)
);

CREATE INDEX IF NOT EXISTS idx_nazk_ws_category ON opendata_nazk_war_sanctions(category);
CREATE INDEX IF NOT EXISTS idx_nazk_ws_name ON opendata_nazk_war_sanctions USING gin(to_tsvector('simple', coalesce(name_uk, '') || ' ' || coalesce(page_title, '')));
CREATE INDEX IF NOT EXISTS idx_nazk_ws_tin ON opendata_nazk_war_sanctions(tin) WHERE tin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nazk_ws_jurisdictions ON opendata_nazk_war_sanctions USING gin(sanction_jurisdictions);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. АМКУ — зведені відомості про спотворення результатів торгів (bid-rigging)
--    Consolidated data on tender-distortion violations (per-row from XLSX)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_amcu_bid_rigging (
    id              BIGSERIAL PRIMARY KEY,
    source_file     TEXT NOT NULL,                  -- originating XLSX filename
    row_num         INTEGER,                        -- row index within the file
    decision_date   DATE,                           -- parsed from the file (period snapshot)
    entity_name     TEXT,                           -- violator name if resolvable
    entity_edrpou   TEXT,                           -- ЄДРПОУ if present
    row_data        JSONB NOT NULL,                 -- full row keyed by header
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source_file, row_num)
);

CREATE INDEX IF NOT EXISTS idx_amcu_bid_edrpou ON opendata_amcu_bid_rigging(entity_edrpou) WHERE entity_edrpou IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_amcu_bid_name ON opendata_amcu_bid_rigging USING gin(to_tsvector('simple', coalesce(entity_name, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. АМКУ — рішення та рекомендації (decisions) : document metadata + text
--    Archives (zip/7z) of doc/docx + annual index XLSX. One row per document file.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_amcu_decisions (
    id              BIGSERIAL PRIMARY KEY,
    archive_file    TEXT,                           -- originating archive (relative path)
    doc_file        TEXT NOT NULL,                  -- document filename inside the archive
    doc_kind        TEXT,                           -- rishennia | rekomendatsii | list | other
    decision_no     TEXT,                           -- decision number if parsed
    decision_date   DATE,                           -- date parsed from filename
    body_text       TEXT,                           -- extracted text (docx via mammoth; empty for legacy .doc)
    extracted       BOOLEAN DEFAULT FALSE,          -- whether body_text was successfully extracted
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (doc_file)
);

CREATE INDEX IF NOT EXISTS idx_amcu_dec_date ON opendata_amcu_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_amcu_dec_kind ON opendata_amcu_decisions(doc_kind);
CREATE INDEX IF NOT EXISTS idx_amcu_dec_body ON opendata_amcu_decisions USING gin(to_tsvector('simple', coalesce(body_text, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 5. ВРУ — стенограми пленарних засідань (legislative intent)
--    HTM per sitting day (windows-1251), by convocation.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS opendata_rada_stenograms (
    id              BIGSERIAL PRIMARY KEY,
    convocation     INTEGER,                        -- skl number (1..9)
    sitting_date    DATE,                           -- parsed from filename YYYYMMDD
    doc_kind        TEXT,                           -- stenogram | agenda | stenpog
    source_file     TEXT NOT NULL,                  -- relative path of the HTM
    body_text       TEXT,                           -- plain text (win-1251 decoded, HTML stripped)
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source_file)
);

CREATE INDEX IF NOT EXISTS idx_stenogram_conv_date ON opendata_rada_stenograms(convocation, sitting_date);
CREATE INDEX IF NOT EXISTS idx_stenogram_kind ON opendata_rada_stenograms(doc_kind);
CREATE INDEX IF NOT EXISTS idx_stenogram_body ON opendata_rada_stenograms USING gin(to_tsvector('simple', coalesce(body_text, '')));
