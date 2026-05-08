CREATE TABLE IF NOT EXISTS session_links (
  link_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_session  UUID NOT NULL REFERENCES workflow_sessions(session_id) ON DELETE CASCADE,
  target_session  UUID NOT NULL REFERENCES workflow_sessions(session_id) ON DELETE CASCADE,
  link_type       TEXT NOT NULL CHECK (link_type IN ('temporal_proximity', 'file_overlap', 'explicit_ref', 'manual')),
  confidence      TEXT NOT NULL CHECK (confidence IN ('strong', 'medium', 'weak')),
  hours_apart     NUMERIC(8,2),
  metadata        JSONB DEFAULT '{}',
  UNIQUE (source_session, target_session)
);

CREATE INDEX IF NOT EXISTS idx_session_links_source ON session_links(source_session);
CREATE INDEX IF NOT EXISTS idx_session_links_target ON session_links(target_session);
