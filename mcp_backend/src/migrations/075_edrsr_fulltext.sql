-- ЄДРСР fulltext storage for court decisions
-- Stores plain text extracted from RTF files (od.reyestr.court.gov.ua)

CREATE TABLE IF NOT EXISTS edrsr_fulltext (
  doc_id BIGINT PRIMARY KEY,
  full_text TEXT,
  text_length INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
