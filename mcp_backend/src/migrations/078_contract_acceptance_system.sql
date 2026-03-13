-- Migration: Contract acceptance system
-- Date: 2026-03-14
-- Description: Add eula_type and document_version columns to eula_acceptances,
--              create per-type contract sequences, backfill existing data

-- Add new columns
ALTER TABLE eula_acceptances
  ADD COLUMN IF NOT EXISTS eula_type VARCHAR(30) DEFAULT 'offer',
  ADD COLUMN IF NOT EXISTS document_version VARCHAR(20);

-- Create sequences for each contract type
CREATE SEQUENCE IF NOT EXISTS client_offer_contract_seq START 1;
CREATE SEQUENCE IF NOT EXISTS marketplace_rules_contract_seq START 1;
-- attorney_offer_contract_seq already exists from migration 077

-- Backfill eula_type from existing eula_version strings
DO $$
BEGIN
  UPDATE eula_acceptances
    SET eula_type = 'attorney_offer'
    WHERE eula_version LIKE 'attorney-offer%'
      AND (eula_type IS NULL OR eula_type = 'offer');

  UPDATE eula_acceptances
    SET eula_type = 'offer'
    WHERE eula_version LIKE 'client-offer%'
      AND (eula_type IS NULL OR eula_type = 'offer');

  UPDATE eula_acceptances
    SET eula_type = 'marketplace_rules'
    WHERE eula_version LIKE 'marketplace-rules%'
      AND (eula_type IS NULL OR eula_type = 'offer');
END $$;

-- Backfill document_version from eula_version (extract version number after last dash)
DO $$
BEGIN
  UPDATE eula_acceptances
    SET document_version = regexp_replace(eula_version, '^.*-(\d+\.\d+)$', '\1')
    WHERE document_version IS NULL
      AND eula_version ~ '-\d+\.\d+$';
END $$;

-- Unique constraint: one acceptance per (user, type, version)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_eula_user_type_version'
  ) THEN
    ALTER TABLE eula_acceptances
      ADD CONSTRAINT uq_eula_user_type_version UNIQUE (user_id, eula_type, document_version);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_eula_acceptances_type_version
  ON eula_acceptances(user_id, eula_type, document_version);

COMMENT ON COLUMN eula_acceptances.eula_type IS 'Contract type: offer, attorney_offer, marketplace_rules';
COMMENT ON COLUMN eula_acceptances.document_version IS 'Document content version; version bump requires re-acceptance';
