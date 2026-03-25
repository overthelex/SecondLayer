-- 105: Add is_public flag to workflow_sets
ALTER TABLE workflow_sets ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_workflow_sets_public ON workflow_sets (is_public) WHERE is_public = true;
