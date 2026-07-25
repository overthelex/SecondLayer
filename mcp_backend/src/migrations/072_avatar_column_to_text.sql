-- Migration 072: Widen users.picture column from VARCHAR(500) to TEXT
-- to support MinIO object paths and longer URLs
DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN picture TYPE TEXT;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Column picture already TEXT or error: %', SQLERRM;
END $$;
