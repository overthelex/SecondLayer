-- Migration 088: B2B Invoices for Legal Entities
-- Adds support for bank transfer (безготівковий розрахунок) invoicing

-- Sequence for invoice numbers (B2B-YYYY-NNNNN)
CREATE SEQUENCE IF NOT EXISTS b2b_invoice_number_seq START WITH 1;

-- Main B2B invoices table
CREATE TABLE IF NOT EXISTS b2b_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(20) NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),

  -- Invoice type
  invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('subscription', 'topup')),
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'sent', 'paid', 'cancelled', 'overdue')),

  -- Subscription details (nullable for topup)
  tier_key VARCHAR(50) REFERENCES billing_tiers(tier_key),
  billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual')),

  -- Amounts
  amount_uah NUMERIC(12, 2) NOT NULL,
  vat_uah NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_uah NUMERIC(12, 2) NOT NULL,
  amount_usd NUMERIC(12, 2),

  -- Buyer snapshot
  buyer_name VARCHAR(255) NOT NULL,
  buyer_edrpou VARCHAR(20) NOT NULL,
  buyer_address TEXT,
  buyer_email VARCHAR(255),

  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Admin confirmation
  confirmed_by UUID REFERENCES users(id),
  payment_reference VARCHAR(255),

  -- Notes
  notes TEXT,
  admin_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_b2b_invoices_organization_id ON b2b_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_b2b_invoices_status ON b2b_invoices(status);
CREATE INDEX IF NOT EXISTS idx_b2b_invoices_requested_by ON b2b_invoices(requested_by);
CREATE INDEX IF NOT EXISTS idx_b2b_invoices_due_date_unpaid ON b2b_invoices(due_date) WHERE status IN ('issued', 'sent');
