-- Migration 134: CH court decisions (entscheidsuche.ch aggregator)
-- Source: entscheidsuche.ch - ~500K decisions across federal + 26 cantonal courts

CREATE TABLE IF NOT EXISTS ch_court_decisions (
    ecli                TEXT PRIMARY KEY,
    spider              TEXT NOT NULL,
    court_code          TEXT,
    court_name          TEXT,
    chamber             TEXT,
    decision_type       TEXT,
    decision_date       DATE,
    docket_number       TEXT,
    parties             TEXT,
    abstract            TEXT,
    full_text           TEXT,
    pdf_url             TEXT,
    json_url            TEXT,
    languages           TEXT[],
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_court_spider ON ch_court_decisions(spider);
CREATE INDEX IF NOT EXISTS idx_ch_court_court ON ch_court_decisions(court_code);
CREATE INDEX IF NOT EXISTS idx_ch_court_date ON ch_court_decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_ch_court_type ON ch_court_decisions(decision_type);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ch_court_fts') THEN
        CREATE INDEX idx_ch_court_fts ON ch_court_decisions
            USING GIN (to_tsvector('simple',
                coalesce(parties, '') || ' ' ||
                coalesce(abstract, '') || ' ' ||
                coalesce(full_text, '')));
    END IF;
END $$;
