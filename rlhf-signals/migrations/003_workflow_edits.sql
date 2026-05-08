CREATE TABLE IF NOT EXISTS workflow_edits (
  edit_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID NOT NULL REFERENCES workflow_sessions(session_id) ON DELETE CASCADE,
  from_artifact_id     UUID NOT NULL REFERENCES workflow_artifacts(artifact_id),
  to_artifact_id       UUID NOT NULL REFERENCES workflow_artifacts(artifact_id),
  edit_distance        INT NOT NULL,
  edit_distance_norm   NUMERIC(5,4),
  semantic_change_class TEXT CHECK (semantic_change_class IN (
    'cosmetic', 'reorganization', 'factual_correction',
    'tone_adjustment', 'substantive_rewrite', 'rejection'
  )),
  edit_seconds         INT,
  inferred_class       BOOLEAN NOT NULL DEFAULT FALSE,
  metadata             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_edits_session ON workflow_edits(session_id);
CREATE INDEX IF NOT EXISTS idx_edits_class ON workflow_edits(semantic_change_class);
