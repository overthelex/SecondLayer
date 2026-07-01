-- Bill documents (супровідні документи законопроектів)
-- Source: data.rada.gov.ua/ogd/zpr/sklN/billinfo-sklN.json (full endpoint, ~130 MB, daily)
-- Covers every workflow/source document per bill, including:
--   * ГНЕУ conclusions      → kind_id = 100, kind = 'Науково-експертний висновок'
--   * committee conclusions → 'Висновок Головного комітету' / 'Висновок комітету'
--   * budget / EU-integration / anti-corruption / linguistic expert reviews
--   * ГЮУ remarks           → 'Зауваження Головного юридичного управління'
-- short_review / formal_review carry a machine-readable verdict; docFiles carry the PDF links.
-- Soft-linked to bills via bill_number / rada_bill_id (no hard FK: the doc source lists a few
-- hundred bills not present in rada.bills, and we must not drop their documents).

CREATE TABLE IF NOT EXISTS bill_documents (
  doc_id            BIGINT PRIMARY KEY,                       -- workflow/source item .id (Rada document id)
  rada_bill_id      BIGINT NOT NULL,                          -- billinfo bill .id (pf3511 id)
  bill_number       VARCHAR(50),                              -- registrationNumber
  convocation       SMALLINT,                                 -- скликання (9, 8, ...)
  doc_group         VARCHAR(20) NOT NULL DEFAULT 'workflow',  -- 'workflow' | 'source'
  kind_id           INTEGER,                                  -- .kindId (100 = ГНЕУ)
  kind              TEXT,                                     -- .kind
  registration_num  VARCHAR(120),
  registration_date TIMESTAMPTZ,
  outcoming_num     VARCHAR(120),
  outcoming_date    TIMESTAMPTZ,
  publish_date      TIMESTAMPTZ,
  meeting_date      TIMESTAMPTZ,
  short_review      TEXT,                                     -- machine-readable verdict summary
  formal_review     TEXT,
  main_speaker      TEXT,
  file_url          TEXT,                                     -- first docFiles[].url (PDF)
  file_zip_url      TEXT,                                     -- first docFiles[].archiveWithSignsUrl
  doc_files         JSONB,                                    -- full docFiles array
  full_text         TEXT,                                     -- nullable; filled from PDF (phase 2)
  raw               JSONB,                                    -- full source item
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_documents_bill_number ON bill_documents(bill_number);
CREATE INDEX IF NOT EXISTS idx_bill_documents_rada_bill_id ON bill_documents(rada_bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_documents_kind_id ON bill_documents(kind_id);
CREATE INDEX IF NOT EXISTS idx_bill_documents_reg_date ON bill_documents(registration_date);

-- Full-text over the verdict summaries + extracted PDF text ('simple' config: Ukrainian, no stemmer)
CREATE INDEX IF NOT EXISTS idx_bill_documents_review_fts ON bill_documents
  USING gin(to_tsvector('simple',
    coalesce(short_review, '') || ' ' || coalesce(formal_review, '') || ' ' || coalesce(full_text, '')));
