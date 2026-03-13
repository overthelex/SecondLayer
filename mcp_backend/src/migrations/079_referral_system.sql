-- Migration 079: Referral System (MVP)
-- One-level referral system with 20% reward on first top-up

-- Referral codes (one per user)
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(12) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_referral_user UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- Referral links (who invited whom)
CREATE TABLE IF NOT EXISTS referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  referred_id UUID NOT NULL REFERENCES users(id),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_referred UNIQUE (referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_links_referrer ON referral_links(referrer_id);

-- Referral rewards
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID NOT NULL REFERENCES users(id),
  source_user_id UUID NOT NULL REFERENCES users(id),
  source_transaction_id VARCHAR,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  amount_usd DECIMAL(10,2) NOT NULL,
  amount_uah DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'credited',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_beneficiary ON referral_rewards(beneficiary_id);
