-- Migration 084: Referral system — verification + lifetime rewards
-- 1. Add verification fields to referral_codes (FOP/TOV/Attorney only)
-- 2. Allow multiple rewards per referred user (lifetime, not just first top-up)

-- Add verification fields
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS referrer_type TEXT;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS business_code TEXT;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Add constraint for referrer_type values
DO $$ BEGIN
  ALTER TABLE referral_codes ADD CONSTRAINT chk_referrer_type
    CHECK (referrer_type IS NULL OR referrer_type IN ('fop', 'tov', 'attorney'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add unique constraint on source_transaction_id to prevent double-processing same transaction
-- but allow multiple rewards from same referred user (lifetime model)
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_transaction
  ON referral_rewards(source_transaction_id) WHERE source_transaction_id IS NOT NULL;

-- Index for efficient lookup of total paid by referred users
CREATE INDEX IF NOT EXISTS idx_referral_rewards_source_user
  ON referral_rewards(source_user_id);
