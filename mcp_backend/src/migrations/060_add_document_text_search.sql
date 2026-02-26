-- Migration 060: Add full-text search to documents table
-- Adds a tsvector column with GIN index for fast keyword search

-- Step 1: Add generated tsvector column
-- Using 'simple' config (no stemming) — works well for Ukrainian text
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE documents ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Step 2: Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_documents_search_vector
  ON documents USING GIN (search_vector);

-- Step 3: Create trigger function to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(LEFT(NEW.full_text, 50000), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger (drop first to make idempotent)
DROP TRIGGER IF EXISTS trg_documents_search_vector ON documents;
CREATE TRIGGER trg_documents_search_vector
  BEFORE INSERT OR UPDATE OF title, full_text ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_search_vector_update();

-- Step 5: Backfill existing rows
UPDATE documents
SET search_vector =
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(LEFT(full_text, 50000), '')), 'B')
WHERE search_vector IS NULL;
