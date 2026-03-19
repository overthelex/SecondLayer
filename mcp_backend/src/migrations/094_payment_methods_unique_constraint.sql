-- Migration 094: Add unique constraint for payment method upsert
-- Prevents duplicate cards (same provider + last4 per user)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_payment_methods_user_provider_card_unique'
  ) THEN
    ALTER TABLE billing_payment_methods
      ADD CONSTRAINT billing_payment_methods_user_provider_card_unique
      UNIQUE (user_id, provider, card_last4);
  END IF;
END $$;
