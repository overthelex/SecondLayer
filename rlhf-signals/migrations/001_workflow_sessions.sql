CREATE TABLE IF NOT EXISTS workflow_sessions (
  session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL CHECK (source IN (
    'github_pr', 'plane_issue', 'claude_code_transcript',
    'mcp_call', 'email_thread', 'linkedin_draft', 'manual'
  )),
  external_ref    TEXT NOT NULL,
  surface_tags    TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL,
  terminal_at     TIMESTAMPTZ,
  terminal_action TEXT,
  thread_position INT,
  capture_mode    TEXT NOT NULL CHECK (capture_mode IN ('retro', 'live')),
  consent_status  TEXT NOT NULL DEFAULT 'pending'
                  CHECK (consent_status IN ('pending', 'granted', 'revoked')),
  metadata        JSONB DEFAULT '{}',
  UNIQUE (source, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_sessions_source_created ON workflow_sessions(source, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_consent ON workflow_sessions(consent_status);
