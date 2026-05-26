-- Migration 154: France, Germany, Belgium court decisions
-- Sources:
--   FR: HF antoinejeannot/jurisprudence (1.13M, Cour de cassation + appel + tribunaux)
--   DE: HF openlegaldata/court-decisions-germany (250K) + Zenodo federal courts
--   BE: OpenJustice.be API (~227K) + Constitutional Court (~5.5K)

-- ============================================================
-- FRANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS fr_court_decisions (
    id                  TEXT PRIMARY KEY,
    ecli                TEXT UNIQUE,
    source              TEXT NOT NULL,
    jurisdiction        TEXT,
    court_name          TEXT,
    chamber             TEXT,
    case_number         TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    solution            TEXT,
    themes              TEXT[],
    summary             TEXT,
    full_text           TEXT,
    zones               JSONB,
    source_url          TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fr_court_source ON fr_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_fr_court_jurisdiction ON fr_court_decisions(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_fr_court_date ON fr_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_fr_court_type ON fr_court_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_fr_court_ecli ON fr_court_decisions(ecli);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fr_court_fts') THEN
        CREATE INDEX idx_fr_court_fts ON fr_court_decisions
            USING GIN (to_tsvector('french',
                coalesce(summary, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- GERMANY
-- ============================================================

CREATE TABLE IF NOT EXISTS de_court_decisions (
    id                  TEXT PRIMARY KEY,
    ecli                TEXT,
    source              TEXT NOT NULL,
    court_name          TEXT,
    court_type          TEXT,
    court_level         TEXT,
    case_number         TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    subject_area        TEXT,
    full_text           TEXT,
    tenor               TEXT,
    tatbestand          TEXT,
    reasoning           TEXT,
    source_url          TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_de_court_source ON de_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_de_court_name ON de_court_decisions(court_name);
CREATE INDEX IF NOT EXISTS idx_de_court_date ON de_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_de_court_type ON de_court_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_de_court_ecli ON de_court_decisions(ecli);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_de_court_fts') THEN
        CREATE INDEX idx_de_court_fts ON de_court_decisions
            USING GIN (to_tsvector('german',
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- BELGIUM
-- ============================================================

CREATE TABLE IF NOT EXISTS be_court_decisions (
    id                  TEXT PRIMARY KEY,
    ecli                TEXT UNIQUE,
    source              TEXT NOT NULL,
    court_name          TEXT,
    language            TEXT,
    case_number         TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    summary             TEXT,
    full_text           TEXT,
    source_url          TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_be_court_source ON be_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_be_court_name ON be_court_decisions(court_name);
CREATE INDEX IF NOT EXISTS idx_be_court_date ON be_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_be_court_lang ON be_court_decisions(language);
CREATE INDEX IF NOT EXISTS idx_be_court_ecli ON be_court_decisions(ecli);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_be_court_fts') THEN
        CREATE INDEX idx_be_court_fts ON be_court_decisions
            USING GIN (to_tsvector('french',
                coalesce(summary, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;
