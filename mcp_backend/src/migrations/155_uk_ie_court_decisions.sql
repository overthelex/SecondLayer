-- Migration 155: UK and Ireland court decisions
-- Sources:
--   UK: National Archives Case Law API (~70K), santoshtyss/uk_courts_cases HF (43K), JuDDGES/en-court-raw HF (6K)
--   IE: courts.ie scraping (~16K)

-- ============================================================
-- UNITED KINGDOM
-- ============================================================

CREATE TABLE IF NOT EXISTS uk_court_decisions (
    id                  TEXT PRIMARY KEY,
    ecli                TEXT UNIQUE,
    source              TEXT NOT NULL,  -- 'national-archives', 'hf-uk-courts', 'hf-juddges-en'
    court_name          TEXT,
    court_code          TEXT,           -- 'uksc', 'ewca/civ', 'ewhc/admin', etc.
    case_number         TEXT,
    neutral_citation    TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    judge               TEXT,
    judges              JSONB,
    subject             TEXT,
    keywords            TEXT[],
    parties             TEXT,
    abstract            TEXT,
    full_text           TEXT,
    source_url          TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uk_court_source ON uk_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_uk_court_code ON uk_court_decisions(court_code);
CREATE INDEX IF NOT EXISTS idx_uk_court_date ON uk_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_uk_court_case_num ON uk_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_uk_court_neutral_cit ON uk_court_decisions(neutral_citation);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_uk_court_fts') THEN
        CREATE INDEX idx_uk_court_fts ON uk_court_decisions
            USING GIN (to_tsvector('english',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- IRELAND
-- ============================================================

CREATE TABLE IF NOT EXISTS ie_court_decisions (
    id                  TEXT PRIMARY KEY,
    ecli                TEXT UNIQUE,
    source              TEXT NOT NULL,  -- 'courts-ie'
    court_name          TEXT,
    court_type          TEXT,           -- 'Supreme Court', 'High Court', 'Court of Appeal'
    case_number         TEXT,
    neutral_citation    TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    judge               TEXT,
    parties             TEXT,
    abstract            TEXT,
    full_text           TEXT,
    source_url          TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ie_court_source ON ie_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_ie_court_type ON ie_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_ie_court_date ON ie_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_ie_court_case_num ON ie_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_ie_court_neutral_cit ON ie_court_decisions(neutral_citation);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ie_court_fts') THEN
        CREATE INDEX idx_ie_court_fts ON ie_court_decisions
            USING GIN (to_tsvector('english',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;
