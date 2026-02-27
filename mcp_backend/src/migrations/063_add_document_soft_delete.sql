-- Migration 063: Add soft-delete support for documents (undo/redo)

-- Add deleted_at column
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN
  NULL;
END $$;

-- Partial index: only non-deleted documents for user queries
CREATE INDEX IF NOT EXISTS idx_documents_user_active
  ON documents (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Function to permanently purge soft-deleted documents older than retention_days
CREATE OR REPLACE FUNCTION purge_soft_deleted_documents(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM documents
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
