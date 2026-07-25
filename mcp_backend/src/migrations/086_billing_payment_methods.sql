-- Migration 086: Add saved payment methods table
-- Stores payment methods from successful payments for reuse

CREATE TABLE IF NOT EXISTS billing_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Provider info
  provider VARCHAR(50) NOT NULL, -- 'monobank', 'metamask', 'binance_pay'

  -- Card details (for card-based providers like Monobank)
  card_last4 VARCHAR(4),
  card_brand VARCHAR(50),   -- 'visa', 'mastercard', etc.
  card_bank VARCHAR(100),   -- 'Монобанк', 'ПриватБанк', etc.

  -- Crypto details (for crypto providers)
  wallet_address VARCHAR(255),
  crypto_network VARCHAR(50), -- 'ethereum', 'polygon'

  -- Display
  label VARCHAR(255),       -- User-friendly label
  is_primary BOOLEAN DEFAULT false NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_user_id
  ON billing_payment_methods(user_id);

-- Ensure only one primary method per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_payment_methods_primary
  ON billing_payment_methods(user_id) WHERE is_primary = true;

COMMENT ON TABLE billing_payment_methods IS 'Saved payment methods for billing top-ups';
