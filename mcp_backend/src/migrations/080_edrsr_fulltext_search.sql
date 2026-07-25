-- Migration 080: Add tsvector column to edrsr_fulltext for Full Text Search
-- The tsv column will be populated incrementally by a background service (EdsrFtsService),
-- NOT in this migration — populating 125M+ rows inline would be too slow.
-- Uses 'simple' text search config (no Ukrainian stemmer in stock PG, but 'simple' tokenizes well).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'edrsr_fulltext' AND column_name = 'tsv'
  ) THEN
    ALTER TABLE edrsr_fulltext ADD COLUMN tsv tsvector;
  END IF;
END $$;

-- GIN index on tsvector column for fast full text search
-- Wrapped in existence check to avoid lock contention on 125M-row table
-- when background FTS workers are running concurrent UPDATEs.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_edrsr_fulltext_tsv'
  ) THEN
    CREATE INDEX idx_edrsr_fulltext_tsv ON edrsr_fulltext USING gin(tsv);
  END IF;
END $$;
