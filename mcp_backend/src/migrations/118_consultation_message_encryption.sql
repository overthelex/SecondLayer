-- Migration 118: Add encryption metadata to consultation messages
-- Encrypted messages store AES-256-GCM ciphertext in content field.

ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS msg_counter INTEGER;
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS key_version INTEGER DEFAULT 1;

-- Attachment encryption metadata
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS attachment_encrypted_dek TEXT;
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS attachment_iv TEXT;
