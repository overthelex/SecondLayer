-- Add UAH balance tracking to billing_transactions
-- Previously only balance_before_usd / balance_after_usd were stored,
-- making UAH topups (Monobank) appear to not change the balance.

ALTER TABLE billing_transactions
  ADD COLUMN IF NOT EXISTS balance_before_uah NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS balance_after_uah NUMERIC(10,2);

-- Backfill: set balance_after_uah for existing topup transactions from user_billing
-- (approximate — uses current balance minus subsequent changes)
-- We can't perfectly reconstruct historical UAH balances, so leave NULLs for old rows.
