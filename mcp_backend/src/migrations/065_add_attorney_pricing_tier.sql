-- Migration 065: Add 'attorney' pricing tier
-- Adds attorney tier with 30% markup, higher daily/monthly limits

-- 1. Update the check constraint on user_billing to include 'attorney'
DO $$ BEGIN
  ALTER TABLE user_billing DROP CONSTRAINT IF EXISTS check_pricing_tier;
  ALTER TABLE user_billing ADD CONSTRAINT check_pricing_tier
    CHECK (pricing_tier IN ('free', 'startup', 'business', 'enterprise', 'internal', 'attorney'));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'user_billing table does not exist, skipping constraint update';
END $$;

-- 2. Insert attorney tier into pricing_tiers (DB-backed config)
INSERT INTO pricing_tiers (tier_key, markup_percentage, description, features, monthly_price_usd, annual_price_usd, trial_days, is_active, display_name, display_order)
VALUES (
  'attorney',
  30,
  'Attorney tier - 30% markup with higher limits for legal professionals',
  '["Legal consultations management", "Advanced legal document analysis", "Court practice deep search", "Priority support (12h response)", "Higher daily/monthly limits ($50/$500)"]',
  49,
  490,
  14,
  true,
  'Attorney',
  2
)
ON CONFLICT (tier_key) DO UPDATE SET
  markup_percentage = EXCLUDED.markup_percentage,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  monthly_price_usd = EXCLUDED.monthly_price_usd,
  annual_price_usd = EXCLUDED.annual_price_usd,
  trial_days = EXCLUDED.trial_days,
  is_active = EXCLUDED.is_active,
  display_name = EXCLUDED.display_name,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
