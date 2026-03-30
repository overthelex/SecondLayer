-- Migration 121: Encryption at rest for conversation messages
-- Each conversation gets a DEK (Data Encryption Key) wrapped with the user's public key.
-- Message content is encrypted client-side before sync, decrypted on load.

-- Conversation-level encryption keys
CREATE TABLE IF NOT EXISTS conversation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_dek TEXT NOT NULL,  -- ECDH-wrapped DEK (base64)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_keys_conv ON conversation_keys(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_keys_user ON conversation_keys(user_id);

-- Track which messages are encrypted
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
