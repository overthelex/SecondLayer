-- Migration 140: Restrict chat + upload to users who topped up via Monobank
-- or who are explicitly enrolled in the beta-tester group.
--
-- The application gate (see src/services/access-gate.ts) allows a user to
-- run paid operations (chat, document upload) only if at least one of the
-- following holds:
--   1. users.is_beta_tester = TRUE
--   2. users.role = 'administrator' (or legacy users.is_admin = TRUE)
--   3. there exists a successful Monobank top-up in billing_transactions
--      (type = 'topup', payment_provider = 'monobank', amount_usd > 0)

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_beta_tester
  ON users (is_beta_tester) WHERE is_beta_tester = TRUE;

-- Helper index for the Monobank top-up lookup performed on every chat /
-- upload request. Partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_billing_tx_monobank_topup
  ON billing_transactions (user_id)
  WHERE type = 'topup' AND payment_provider = 'monobank';
