-- Migration 159: Singapore court decisions
-- Sources:
--   eLitigation (elitigation.sg/gdviewer/) — ~10,700 Supreme Court + State Court judgments (2000-present)
--   Singapore Law Watch RSS — real-time monitoring feed

CREATE TABLE IF NOT EXISTS sg_court_decisions (
    id                  TEXT PRIMARY KEY,
    neutral_citation    TEXT UNIQUE,
    source              TEXT NOT NULL,       -- 'elitigation', 'slw-rss'
    court_name          TEXT,
    court_code          TEXT,                -- SGCA, SGHC, SGHCA, SGHCI, SGHCF, SGHCR, SGDC, SGMC, SGFC, etc.
    case_number         TEXT,
    case_name           TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    judge               TEXT,
    subject             TEXT,
    keywords            TEXT[],
    parties             TEXT,
    coram               TEXT,
    counsel             TEXT,
    abstract            TEXT,
    full_text           TEXT,
    source_url          TEXT,
    pdf_url             TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sg_court_source ON sg_court_decisions(source);
CREATE INDEX IF NOT EXISTS idx_sg_court_code ON sg_court_decisions(court_code);
CREATE INDEX IF NOT EXISTS idx_sg_court_date ON sg_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_sg_court_case_num ON sg_court_decisions(case_number);
CREATE INDEX IF NOT EXISTS idx_sg_court_citation ON sg_court_decisions(neutral_citation);
CREATE INDEX IF NOT EXISTS idx_sg_court_name ON sg_court_decisions(case_name);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sg_court_fts') THEN
        CREATE INDEX idx_sg_court_fts ON sg_court_decisions
            USING GIN (to_tsvector('english',
                coalesce(case_name, '') || ' ' ||
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;

-- Trigger for jurisdiction_fulltext_stats
CREATE OR REPLACE FUNCTION sg_court_decisions_stats_trigger() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.full_text IS NOT NULL AND length(NEW.full_text) > 100 THEN
        INSERT INTO jurisdiction_fulltext_stats (jurisdiction, total_decisions, with_fulltext, last_updated)
        VALUES ('SG', 1, 1, NOW())
        ON CONFLICT (jurisdiction) DO UPDATE SET
            total_decisions = jurisdiction_fulltext_stats.total_decisions + 1,
            with_fulltext = jurisdiction_fulltext_stats.with_fulltext + 1,
            last_updated = NOW();
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO jurisdiction_fulltext_stats (jurisdiction, total_decisions, with_fulltext, last_updated)
        VALUES ('SG', 1, 0, NOW())
        ON CONFLICT (jurisdiction) DO UPDATE SET
            total_decisions = jurisdiction_fulltext_stats.total_decisions + 1,
            last_updated = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sg_court_stats ON sg_court_decisions;
CREATE TRIGGER trg_sg_court_stats
    AFTER INSERT ON sg_court_decisions
    FOR EACH ROW EXECUTE FUNCTION sg_court_decisions_stats_trigger();
