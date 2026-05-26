-- Migration 153: Baltic states court decisions
-- Sources:
--   LT: LITEKO CSV bulk (liteko.teismai.lt, ~51K decisions, CC BY 4.0)
--   LV: manas.tiesas.lv (~127K PDF decisions)
--   EE: avaandmed.rik.ee (497K metadata XML + ECLI sitemaps)

-- ============================================================
-- LITHUANIA
-- ============================================================

CREATE TABLE IF NOT EXISTS lt_court_decisions (
    id                  TEXT PRIMARY KEY,
    dokumento_id        TEXT UNIQUE,
    source              TEXT NOT NULL,
    court_name          TEXT,
    case_number         TEXT,
    instance            TEXT,
    case_type           TEXT,
    result              TEXT,
    decision_date       DATE,
    received_date       DATE,
    judge               TEXT,
    panel               TEXT,
    parties             TEXT,
    categories          TEXT[],
    eu_norms            TEXT[],
    duration_days       INT,
    full_text           TEXT,
    source_url          TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lt_court_source ON lt_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_lt_court_name ON lt_court_decisions(court_name);
CREATE INDEX IF NOT EXISTS idx_lt_court_case_num ON lt_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_lt_court_date ON lt_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_lt_court_type ON lt_court_decisions(case_type);
CREATE INDEX IF NOT EXISTS idx_lt_court_instance ON lt_court_decisions(instance);
CREATE INDEX IF NOT EXISTS idx_lt_court_dokid ON lt_court_decisions(dokumento_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lt_court_fts') THEN
        CREATE INDEX idx_lt_court_fts ON lt_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- LATVIA
-- ============================================================

CREATE TABLE IF NOT EXISTS lv_court_decisions (
    id                  TEXT PRIMARY KEY,
    source              TEXT NOT NULL,
    court_name          TEXT,
    case_number         TEXT,
    instance            TEXT,
    case_type           TEXT,
    decision_date       DATE,
    full_text           TEXT,
    source_url          TEXT,
    pdf_id              INT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lv_court_source ON lv_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_lv_court_name ON lv_court_decisions(court_name);
CREATE INDEX IF NOT EXISTS idx_lv_court_case_num ON lv_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_lv_court_date ON lv_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_lv_court_type ON lv_court_decisions(case_type);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lv_court_fts') THEN
        CREATE INDEX idx_lv_court_fts ON lv_court_decisions
            USING GIN (to_tsvector('simple', coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- ESTONIA
-- ============================================================

CREATE TABLE IF NOT EXISTS ee_court_decisions (
    id                  TEXT PRIMARY KEY,
    ecli                TEXT UNIQUE,
    source              TEXT NOT NULL,
    court_name          TEXT,
    case_number         TEXT,
    case_type           TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    judge               TEXT,
    outcome             TEXT,
    full_text           TEXT,
    source_url          TEXT,
    pdf_url             TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ee_court_source ON ee_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_ee_court_name ON ee_court_decisions(court_name);
CREATE INDEX IF NOT EXISTS idx_ee_court_case_num ON ee_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_ee_court_date ON ee_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_ee_court_type ON ee_court_decisions(case_type);
CREATE INDEX IF NOT EXISTS idx_ee_court_ecli ON ee_court_decisions(ecli);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ee_court_fts') THEN
        CREATE INDEX idx_ee_court_fts ON ee_court_decisions
            USING GIN (to_tsvector('simple', coalesce(full_text, '')));
    END IF;
END $$;
