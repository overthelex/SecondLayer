-- Migration 112: Clean up duplicate billing and payment tables; fix workflow_sets.user_id type
-- Date: 2026-03-27
--
-- 1. Drop `payment_methods` (migration 025) — superseded by `billing_payment_methods` (migration 086).
--    No TypeScript code references `payment_methods`; billing_payment_methods is the active table.
--    The trigger and constraint referencing it are dropped automatically with CASCADE.
--
-- 2. Fix `workflow_sets.user_id` from VARCHAR(255) to UUID so it can JOIN with users(id).
--    All values stored are valid UUIDs (supplied from req.user.id which is a UUID).
--    No FOREIGN KEY existed on this column, so no FK drop is needed.

BEGIN;

-- 1. Drop payment_methods (old Stripe/Fondy table, replaced by billing_payment_methods)
DROP TABLE IF EXISTS payment_methods CASCADE;

-- 2. Fix workflow_sets.user_id: VARCHAR(255) → UUID
--    USING clause casts existing string values to UUID.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_sets'
      AND column_name = 'user_id'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE workflow_sets
      ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;
END $$;

-- Recreate the index (DROP CASCADE above would not affect this index, but being explicit)
-- idx_workflow_sets_user_id was created in migration 062; it survives the ALTER COLUMN,
-- but the index type may need refreshing if PG invalidates it. Recreate to be safe.
DROP INDEX IF EXISTS idx_workflow_sets_user_id;
CREATE INDEX IF NOT EXISTS idx_workflow_sets_user_id ON workflow_sets(user_id);

COMMIT;
