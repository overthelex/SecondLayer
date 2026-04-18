-- Migration 135: CH federal legislation (fedlex.data.admin.ch SPARQL + Akoma Ntoso XML)
-- Source: ~13K active acts / ~117K versions, multilingual DE/FR/IT/RM/EN

CREATE TABLE IF NOT EXISTS ch_legislation (
    eli_uri             TEXT NOT NULL,
    lang                TEXT NOT NULL,
    sr_number           TEXT,
    title               TEXT,
    short_title         TEXT,
    version_date        DATE,
    in_force            BOOLEAN,
    date_entry_force    DATE,
    date_end_validity   DATE,
    akn_xml             TEXT,
    full_text           TEXT,
    html_url            TEXT,
    pdf_url             TEXT,
    xml_url             TEXT,
    source              TEXT DEFAULT 'fedlex',
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (eli_uri, lang)
);

CREATE INDEX IF NOT EXISTS idx_ch_leg_sr ON ch_legislation(sr_number);
CREATE INDEX IF NOT EXISTS idx_ch_leg_lang ON ch_legislation(lang);
CREATE INDEX IF NOT EXISTS idx_ch_leg_force ON ch_legislation(in_force);
CREATE INDEX IF NOT EXISTS idx_ch_leg_version ON ch_legislation(version_date);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ch_leg_fts') THEN
        CREATE INDEX idx_ch_leg_fts ON ch_legislation
            USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(full_text, '')));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS ch_bundesblatt (
    eli_uri             TEXT NOT NULL,
    lang                TEXT NOT NULL,
    bbl_year            INTEGER,
    bbl_number          INTEGER,
    title               TEXT,
    publication_date    DATE,
    full_text           TEXT,
    pdf_url             TEXT,
    xml_url             TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (eli_uri, lang)
);

CREATE INDEX IF NOT EXISTS idx_ch_bbl_year ON ch_bundesblatt(bbl_year);
CREATE INDEX IF NOT EXISTS idx_ch_bbl_date ON ch_bundesblatt(publication_date);
