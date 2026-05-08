CREATE TABLE IF NOT EXISTS workflow_artifacts (
  artifact_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES workflow_sessions(session_id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('prompt', 'llm_output', 'edit', 'final')),
  sequence_index  INT NOT NULL,
  content_raw     TEXT,
  content_redacted TEXT,
  content_hash    TEXT NOT NULL,
  token_count     INT,
  timestamp       TIMESTAMPTZ NOT NULL,
  metadata        JSONB DEFAULT '{}',
  UNIQUE (session_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_session ON workflow_artifacts(session_id);
