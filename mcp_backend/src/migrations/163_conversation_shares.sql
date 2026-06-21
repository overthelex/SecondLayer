-- Conversation sharing: shareable read-only links among platform users.
-- A share stores a point-in-time JSON snapshot of the shared content so it is
-- decoupled from E2EE (the frontend sends already-decrypted content) and stays
-- stable even if the source conversation is later edited or deleted.

CREATE TABLE IF NOT EXISTS conversation_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL DEFAULT 'conversation'
    CHECK (scope IN ('conversation', 'message')),
  title TEXT,
  snapshot JSONB NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversation_shares_token ON conversation_shares(token);
CREATE INDEX IF NOT EXISTS idx_conversation_shares_shared_by ON conversation_shares(shared_by, created_at DESC);
