-- Migration 151: Polish and Czech court decisions
-- Sources:
--   PL: SAOS API (536K), JuDDGES/pl-court-raw (437K), JuDDGES/pl-nsa (1.8M)
--   CZ: rozhodnuti.justice.cz API (582K), CzCDC LINDAT (237K), Zenodo Paulik (93K)

-- ============================================================
-- POLAND
-- ============================================================

CREATE TABLE IF NOT EXISTS pl_court_decisions (
    id              TEXT PRIMARY KEY,
    ecli            TEXT UNIQUE,
    source          TEXT NOT NULL,
    court_type      TEXT,
    court_name      TEXT,
    division        TEXT,
    case_number     TEXT,
    decision_type   TEXT,
    decision_date   DATE,
    judge           TEXT,
    judges          JSONB,
    keywords        TEXT[],
    legal_bases     TEXT[],
    referenced_regulations JSONB,
    parties         TEXT,
    abstract        TEXT,
    full_text       TEXT,
    source_url      TEXT,
    metadata_json   JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pl_court_source ON pl_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_pl_court_type ON pl_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_pl_court_date ON pl_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_pl_court_decision_type ON pl_court_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_pl_court_case_num ON pl_court_decisions(case_number);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pl_court_fts') THEN
        CREATE INDEX idx_pl_court_fts ON pl_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- ============================================================
-- CZECH REPUBLIC
-- ============================================================

CREATE TABLE IF NOT EXISTS cz_court_decisions (
    id              TEXT PRIMARY KEY,
    ecli            TEXT UNIQUE,
    source          TEXT NOT NULL,
    court_name      TEXT,
    court_type      TEXT,
    chamber         TEXT,
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
    source_url      TEXT,
    metadata_json   JSONB,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cz_court_source ON cz_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_cz_court_type ON cz_court_decisions(court_type);
CREATE INDEX IF NOT EXISTS idx_cz_court_date ON cz_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_cz_court_decision_type ON cz_court_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_cz_court_case_num ON cz_court_decisions(case_number);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cz_court_fts') THEN
        CREATE INDEX idx_cz_court_fts ON cz_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;
