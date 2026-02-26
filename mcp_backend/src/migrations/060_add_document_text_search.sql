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

-- Step 3: Helper to strip invalid UTF-8 bytes before tsvector conversion
CREATE OR REPLACE FUNCTION safe_to_tsvector(config regconfig, input text) RETURNS tsvector AS $$
BEGIN
  RETURN to_tsvector(config, input);
EXCEPTION WHEN OTHERS THEN
  -- Strip non-ASCII and retry with plain ASCII
  RETURN to_tsvector(config, regexp_replace(input, '[^\x20-\x7E]', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 4: Create trigger function to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(safe_to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(safe_to_tsvector('simple', COALESCE(LEFT(NEW.full_text, 50000), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger (drop first to make idempotent)
DROP TRIGGER IF EXISTS trg_documents_search_vector ON documents;
CREATE TRIGGER trg_documents_search_vector
  BEFORE INSERT OR UPDATE OF title, full_text ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_search_vector_update();

-- Step 6: Backfill existing rows (skip rows with bad encoding)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, title, full_text FROM documents WHERE search_vector IS NULL LOOP
    BEGIN
      UPDATE documents SET search_vector =
        setweight(safe_to_tsvector('simple', COALESCE(r.title, '')), 'A') ||
        setweight(safe_to_tsvector('simple', COALESCE(LEFT(r.full_text, 50000), '')), 'B')
      WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      -- Skip documents with unrecoverable encoding issues
      NULL;
    END;
  END LOOP;
END $$;
