-- Migration 152: Hungarian court decisions
-- Sources:
--   Ordinary courts: eakta.birosag.hu (~225K+ anonymized decisions, DOCX full text)
--   Constitutional Court: HUNCOURT OSF (15K, 1990-2021) + alkotmanybirosag.hu API (2022+)

CREATE TABLE IF NOT EXISTS hu_court_decisions (
    id                  TEXT PRIMARY KEY,
    egyedi_azonosito    TEXT UNIQUE,
    source              TEXT NOT NULL,
    court_name          TEXT,
    collegium           TEXT,
    legal_area          TEXT,
    case_number         TEXT,
    decision_type       TEXT,
    decision_year       INT,
    decision_date       DATE,
    judge               TEXT,
    subject             TEXT,
    summary             TEXT,
    legislation_refs    TEXT[],
    related_cases       JSONB,
    full_text           TEXT,
    source_url          TEXT,
    download_url        TEXT,
    index_id            TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hu_court_source ON hu_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_hu_court_name ON hu_court_decisions(court_name);
CREATE INDEX IF NOT EXISTS idx_hu_court_collegium ON hu_court_decisions(collegium);
CREATE INDEX IF NOT EXISTS idx_hu_court_date ON hu_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_hu_court_year ON hu_court_decisions(decision_year);
CREATE INDEX IF NOT EXISTS idx_hu_court_type ON hu_court_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_hu_court_case_num ON hu_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_hu_court_egyedi ON hu_court_decisions(egyedi_azonosito);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hu_court_fts') THEN
        CREATE INDEX idx_hu_court_fts ON hu_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(summary, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;
