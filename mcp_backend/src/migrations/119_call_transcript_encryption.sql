-- Migration 119: Add encryption flag to call transcripts
-- Encrypted transcripts store AES-256-GCM(root_key, text) with IV prepended.

ALTER TABLE call_transcripts ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
