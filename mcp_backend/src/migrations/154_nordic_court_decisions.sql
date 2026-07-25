-- Migration 154: Nordic court decisions (Denmark, Sweden, Finland, Iceland)
-- Sources:
--   DK: alexandrainst/domsdatabasen HF (~4K), domsdatabasen.dk API
--   SE: swelaw/swelaw HF (~25K), lagen.nu (10K+)
--   FI: Finlex Open Data API (7 courts, decades), eliask/finlex-data GitHub
--   IS: haestirettur.is, landsrettur.is, heradsdomstolar.is (scraped, ~3-5K)

-- ============================================================
-- DENMARK
-- ============================================================

CREATE TABLE IF NOT EXISTS dk_court_decisions (
    id              TEXT PRIMARY KEY,
    ecli            TEXT UNIQUE,
    source          TEXT NOT NULL,
    court_name      TEXT,
    court_type      TEXT,
    case_number     TEXT,
    case_type       TEXT,
    decision_date   DATE,
    judge           TEXT,
    parties         TEXT,
    abstract        TEXT,
    full_text       TEXT,
    anonymized_text TEXT,
    source_url      TEXT,
    metadata_json   JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dk_court_source ON dk_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_dk_court_type ON dk_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_dk_court_date ON dk_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_dk_court_case_num ON dk_court_decisions(case_number);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_dk_court_fts') THEN
        CREATE INDEX idx_dk_court_fts ON dk_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- SWEDEN
-- ============================================================

CREATE TABLE IF NOT EXISTS se_court_decisions (
    id              TEXT PRIMARY KEY,
    ecli            TEXT UNIQUE,
    source          TEXT NOT NULL,
    court_name      TEXT,
    court_type      TEXT,
    case_number     TEXT,
    decision_type   TEXT,
    decision_date   DATE,
    judge           TEXT,
    subject         TEXT,
    keywords        TEXT[],
    parties         TEXT,
    abstract        TEXT,
    full_text       TEXT,
    source_url      TEXT,
    metadata_json   JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_se_court_source ON se_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_se_court_type ON se_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_se_court_date ON se_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_se_court_case_num ON se_court_decisions(case_number);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_se_court_fts') THEN
        CREATE INDEX idx_se_court_fts ON se_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- FINLAND
-- ============================================================

CREATE TABLE IF NOT EXISTS fi_court_decisions (
    id              TEXT PRIMARY KEY,
    ecli            TEXT UNIQUE,
    source          TEXT NOT NULL,
    court_name      TEXT,
    court_type      TEXT,
    case_number     TEXT,
    decision_type   TEXT,
    decision_date   DATE,
    publication_date DATE,
    judge           TEXT,
    subject         TEXT,
    keywords        TEXT[],
    cited_provisions TEXT[],
    parties         TEXT,
    abstract        TEXT,
    full_text       TEXT,
    language        TEXT,
    source_url      TEXT,
    metadata_json   JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fi_court_source ON fi_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_fi_court_type ON fi_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_fi_court_date ON fi_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_fi_court_case_num ON fi_court_decisions(case_number);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fi_court_fts') THEN
        CREATE INDEX idx_fi_court_fts ON fi_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- ICELAND
-- ============================================================

CREATE TABLE IF NOT EXISTS is_court_decisions (
    id              TEXT PRIMARY KEY,
    ecli            TEXT UNIQUE,
    source          TEXT NOT NULL,
    court_name      TEXT,
    court_type      TEXT,
    case_number     TEXT,
    decision_type   TEXT,
    decision_date   DATE,
    judge           TEXT,
    subject         TEXT,
    parties         TEXT,
    abstract        TEXT,
    full_text       TEXT,
    source_url      TEXT,
    metadata_json   JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_is_court_source ON is_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_is_court_type ON is_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_is_court_date ON is_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_is_court_case_num ON is_court_decisions(case_number);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_is_court_fts') THEN
        CREATE INDEX idx_is_court_fts ON is_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;
