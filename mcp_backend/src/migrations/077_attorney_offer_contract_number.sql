-- Migration: Add contract number and date to attorney offer acceptances
-- Date: 2026-03-12
-- Description: Each signed attorney offer gets a unique contract number and date

ALTER TABLE eula_acceptances
  ADD COLUMN IF NOT EXISTS contract_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contract_date DATE;

-- Unique contract number
CREATE UNIQUE INDEX IF NOT EXISTS idx_eula_acceptances_contract_number
  ON eula_acceptances(contract_number) WHERE contract_number IS NOT NULL;

-- Sequence for contract numbering within a year
CREATE SEQUENCE IF NOT EXISTS attorney_offer_contract_seq START 1;

COMMENT ON COLUMN eula_acceptances.contract_number IS 'Unique contract number, format: OFFER-YYYY-NNNN';
COMMENT ON COLUMN eula_acceptances.contract_date IS 'Date the contract was signed';
