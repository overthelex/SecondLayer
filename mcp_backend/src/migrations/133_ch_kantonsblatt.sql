-- Migration 133: CH kantonsblatt.ch HR publications + companies registry
-- Source: amtsblattportal.ch / kantonsblatt.ch - 2.18M HR publications across 26 cantons

CREATE TABLE IF NOT EXISTS ch_kantonsblatt_publications (
    publication_uuid    UUID PRIMARY KEY,
    publication_number  TEXT,
    publication_date    DATE,
    sub_rubric          TEXT,
    cantons             TEXT[],
    title               TEXT,
    publication_text_de TEXT,
    publication_text_fr TEXT,
    publication_text_it TEXT,
    company_uid         TEXT,
    metadata_json       JSONB,
    raw_xml             TEXT,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_kb_pub_date ON ch_kantonsblatt_publications(publication_date);
CREATE INDEX IF NOT EXISTS idx_ch_kb_sub_rubric ON ch_kantonsblatt_publications(sub_rubric);
CREATE INDEX IF NOT EXISTS idx_ch_kb_uid ON ch_kantonsblatt_publications(company_uid);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ch_kb_fts') THEN
        CREATE INDEX idx_ch_kb_fts ON ch_kantonsblatt_publications
            USING GIN (to_tsvector('simple',
                coalesce(title, '') || ' ' ||
                coalesce(publication_text_de, '') || ' ' ||
                coalesce(publication_text_fr, '') || ' ' ||
                coalesce(publication_text_it, '')));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS ch_companies (
    uid                 TEXT PRIMARY KEY,
    code13              TEXT,
    name                TEXT,
    legal_form          TEXT,
    legal_seat          TEXT,
    canton              TEXT,
    capital             NUMERIC(20,2),
    capital_currency    TEXT,
    capital_paid_in     NUMERIC(20,2),
    address             TEXT,
    purpose             TEXT,
    status              TEXT,
    sogc_date           DATE,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_co_canton ON ch_companies(canton);
CREATE INDEX IF NOT EXISTS idx_ch_co_legal_form ON ch_companies(legal_form);
CREATE INDEX IF NOT EXISTS idx_ch_co_status ON ch_companies(status);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ch_co_fts') THEN
        CREATE INDEX idx_ch_co_fts ON ch_companies
            USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(purpose, '')));
    END IF;
END $$;
