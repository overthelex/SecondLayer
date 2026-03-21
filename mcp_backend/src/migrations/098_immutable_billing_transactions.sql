-- Migration 098: Make billing_transactions immutable for refunds
-- Instead of mutating the original transaction, refunds create a new row
-- with type='refund' and reference_transaction_id pointing to the original.

-- Add reference_transaction_id column
ALTER TABLE billing_transactions
  ADD COLUMN IF NOT EXISTS reference_transaction_id UUID REFERENCES billing_transactions(id);

-- Add status column if not exists (some environments may already have it)
ALTER TABLE billing_transactions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';

CREATE INDEX IF NOT EXISTS idx_billing_transactions_reference
  ON billing_transactions(reference_transaction_id)
  WHERE reference_transaction_id IS NOT NULL;

COMMENT ON COLUMN billing_transactions.reference_transaction_id
  IS 'For refunds: points to the original transaction being refunded';
