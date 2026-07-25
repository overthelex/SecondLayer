-- Migration 117: Consultation E2EE key storage
-- Stores wrapped root keys per consultation per participant.
-- The server never sees the plaintext root key — only ECDH-wrapped ciphertext.

CREATE TABLE IF NOT EXISTS consultation_e2ee_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_root_key TEXT NOT NULL,
  key_version INTEGER DEFAULT 1,
  counter_checkpoint INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(consultation_id, user_id, key_version)
);

CREATE INDEX IF NOT EXISTS idx_consultation_e2ee_keys_consultation
  ON consultation_e2ee_keys(consultation_id);

CREATE INDEX IF NOT EXISTS idx_consultation_e2ee_keys_user
  ON consultation_e2ee_keys(user_id);
