-- UAE court decisions corpus
-- Sources: DIFC Courts, ADGM Courts (public, EN), later Dubai Courts / MOJ FSC (AR, via UAE proxy)
CREATE TABLE IF NOT EXISTS ae_court_decisions (
    doc_id            text PRIMARY KEY,          -- "<source>:<native id>", e.g. difc:2026-DIFC-CA-007
    source            text NOT NULL,             -- difc | adgm | dubai_courts | moj_fsc | adjd
    jurisdiction      text,                      -- DIFC | ADGM | Dubai | Abu Dhabi | Federal
    court_name        text,
    court_level       text,                      -- first_instance | appeal | cassation | arbitration | other
    case_number       text,
    neutral_citation  text,
    case_title        text,
    decision_date     date,
    language          text,                      -- en | ar
    parties           text,
    judges            text[],
    decision_type     text,
    full_text         text,
    text_source       text,                      -- html | pdf
    source_url        text,
    pdf_url           text,
    content_sha256    text,
    metadata_json     jsonb,
    imported_at       timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ae_source          ON ae_court_decisions (source);
CREATE INDEX IF NOT EXISTS idx_ae_date            ON ae_court_decisions (decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_ae_source_date     ON ae_court_decisions (source, decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_ae_court_level     ON ae_court_decisions (court_level);
CREATE INDEX IF NOT EXISTS idx_ae_case_number_trgm ON ae_court_decisions USING gin (case_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ae_metadata_jsonb  ON ae_court_decisions USING gin (metadata_json jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_ae_fts_en ON ae_court_decisions
    USING gin (to_tsvector('english', COALESCE(case_title,'') || ' ' || COALESCE(full_text,'')))
    WHERE language = 'en' AND full_text IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_fts_ar ON ae_court_decisions
    USING gin (to_tsvector('arabic', COALESCE(case_title,'') || ' ' || COALESCE(full_text,'')))
    WHERE language = 'ar' AND full_text IS NOT NULL;

COMMENT ON TABLE ae_court_decisions IS 'UAE court decisions (DIFC/ADGM public; Dubai Courts + Federal Supreme Court pending UAE-IP access)';
