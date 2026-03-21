-- Migration 097: Consultation disputes and attorney payouts
-- Adds dispute tracking, attorney bank details, and payout management

-- 1. Add dispute fields to consultations
DO $$ BEGIN
  ALTER TABLE consultations ADD COLUMN dispute_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultations ADD COLUMN dispute_raised_by UUID REFERENCES users(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultations ADD COLUMN dispute_raised_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Create consultation_disputes table
CREATE TABLE IF NOT EXISTS consultation_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id),
  raised_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'resolved')),
  resolution VARCHAR(20)
    CHECK (resolution IN ('refund_full', 'refund_partial', 'dismissed')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultation_disputes_consultation
  ON consultation_disputes(consultation_id);
CREATE INDEX IF NOT EXISTS idx_consultation_disputes_status
  ON consultation_disputes(status) WHERE status != 'resolved';

-- 3. Add bank details to attorney_profiles
DO $$ BEGIN
  ALTER TABLE attorney_profiles ADD COLUMN bank_iban VARCHAR(34);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE attorney_profiles ADD COLUMN bank_name VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE attorney_profiles ADD COLUMN bank_account_holder VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Create attorney_payouts table
CREATE TABLE IF NOT EXISTS attorney_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attorney_user_id UUID NOT NULL REFERENCES users(id),
  consultation_payment_id UUID NOT NULL REFERENCES consultation_payments(id),
  amount_uah NUMERIC(12,2) NOT NULL,
  bank_iban VARCHAR(34),
  bank_account_holder VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  admin_notes TEXT,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attorney_payouts_attorney
  ON attorney_payouts(attorney_user_id);
CREATE INDEX IF NOT EXISTS idx_attorney_payouts_status
  ON attorney_payouts(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_attorney_payouts_payment
  ON attorney_payouts(consultation_payment_id);
