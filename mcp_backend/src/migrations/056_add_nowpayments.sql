-- Migration 056: Add NOWPayments as supported crypto payment provider
-- Date: 2026-02-22

BEGIN;

-- Update get_or_create_payment_intent to allow nowpayments provider
CREATE OR REPLACE FUNCTION get_or_create_payment_intent(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_provider TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS TABLE(
  payment_intent_id UUID,
  status TEXT,
  created BOOLEAN
) LANGUAGE plpgsql AS $$
BEGIN
  IF p_provider NOT IN ('metamask', 'monobank', 'binance_pay', 'nowpayments') THEN
    RAISE EXCEPTION 'Invalid provider: %. Must be metamask, monobank, binance_pay, or nowpayments', p_provider;
  END IF;

  -- Try to find existing pending intent
  RETURN QUERY
  SELECT
    pi.id AS payment_intent_id,
    pi.status,
    FALSE AS created
  FROM payment_intents pi
  WHERE pi.user_id = p_user_id
    AND pi.provider = p_provider
    AND pi.status = 'pending'
    AND pi.created_at > NOW() - INTERVAL '1 hour'
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Create new intent
  RETURN QUERY
  INSERT INTO payment_intents (user_id, amount_usd, provider, status, metadata)
  VALUES (p_user_id, p_amount_usd, p_provider, 'pending', p_metadata)
  RETURNING id AS payment_intent_id, status, TRUE AS created;
END;
$$;

COMMIT;
