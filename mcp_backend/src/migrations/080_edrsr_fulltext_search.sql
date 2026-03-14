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
-- Note: not using CONCURRENTLY because migration runner wraps in transaction block.
-- On 125M rows with mostly NULL tsv values this will be fast (NULLs are not indexed by GIN).
-- The index will grow incrementally as the background service populates tsv values.
CREATE INDEX IF NOT EXISTS idx_edrsr_fulltext_tsv ON edrsr_fulltext USING gin(tsv);
