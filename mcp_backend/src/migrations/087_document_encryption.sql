-- Migration 087: End-to-end document encryption infrastructure
-- Adds user encryption keys, document keys, and encryption flags

-- User encryption key pairs (X25519)
CREATE TABLE IF NOT EXISTS user_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,                    -- X25519 public key, base64
  encrypted_private_key TEXT NOT NULL,         -- AES-256-GCM(master_secret, private_key), base64
  kdf_algorithm VARCHAR(20) DEFAULT 'argon2id',
  kdf_params JSONB DEFAULT '{}',              -- {salt, iterations, memory, parallelism}
  diia_encrypted_master_secret TEXT,           -- Master secret wrapped via Diia signature
  diia_recovery_challenge TEXT,
  diia_recovery_salt TEXT,
  key_version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_encryption_keys_user_id
  ON user_encryption_keys(user_id);

-- Document encryption keys (wrapped DEKs per user)
CREATE TABLE IF NOT EXISTS document_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_dek TEXT NOT NULL,                -- ECDH-ES wrapped DEK, base64
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_document_keys_document_id
  ON document_keys(document_id);

CREATE INDEX IF NOT EXISTS idx_document_keys_user_id
  ON document_keys(user_id);

-- Add encryption flag to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_version INTEGER;

COMMENT ON TABLE user_encryption_keys IS 'User X25519 key pairs for document E2EE — private key encrypted client-side';
COMMENT ON TABLE document_keys IS 'Per-document DEKs wrapped with user public keys (envelope encryption)';
