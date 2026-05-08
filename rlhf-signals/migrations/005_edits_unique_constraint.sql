-- Deduplicate existing edits before adding constraint
DELETE FROM workflow_edits a USING workflow_edits b
WHERE a.edit_id > b.edit_id
  AND a.from_artifact_id = b.from_artifact_id
  AND a.to_artifact_id = b.to_artifact_id;

-- Add unique constraint to prevent duplicate edits
ALTER TABLE workflow_edits
  ADD CONSTRAINT uq_edits_from_to UNIQUE (from_artifact_id, to_artifact_id);
