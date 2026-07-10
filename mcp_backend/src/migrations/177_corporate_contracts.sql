-- Migration 177: corporate client contracts registry.
-- Tracks B2B / corporate API-access agreements (e.g. law firms integrating via API),
-- with links to the contract document, invoices, and any other client documents.

CREATE TABLE IF NOT EXISTS corporate_contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number       VARCHAR(64)  UNIQUE NOT NULL,
  client_name           VARCHAR(255) NOT NULL,                 -- brand / short name
  client_legal_name     VARCHAR(500),                          -- full legal entity name
  client_edrpou         VARCHAR(20),                           -- ЄДРПОУ / tax id
  client_email          VARCHAR(255),
  client_address        TEXT,
  client_signatory      VARCHAR(255),                          -- authorized signer
  contract_type         VARCHAR(64)  NOT NULL DEFAULT 'api_access',
  status                VARCHAR(32)  NOT NULL DEFAULT 'draft',  -- draft|sent|active|suspended|terminated
  contract_date         DATE,                                  -- signing date (null while draft)
  effective_from        DATE,
  effective_to          DATE,
  currency              VARCHAR(8)   NOT NULL DEFAULT 'UAH',
  contract_document_url TEXT,                                  -- link to the contract file (PDF / MinIO)
  invoice_url           TEXT,                                  -- link to the latest / primary invoice
  documents             JSONB        NOT NULL DEFAULT '[]'::jsonb, -- [{type,name,url,uploaded_at}]
  billing_user_id       UUID,                                  -- platform user/account, if linked
  notes                 TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_contracts_status ON corporate_contracts(status);
CREATE INDEX IF NOT EXISTS idx_corporate_contracts_edrpou ON corporate_contracts(client_edrpou);

-- Seed: first corporate contract — Inly Law Firm (API access, LEX AI).
INSERT INTO corporate_contracts (
  contract_number, client_name, client_legal_name, client_edrpou, client_email,
  client_address, client_signatory, contract_type, status, currency,
  contract_document_url, invoice_url, documents, notes
) VALUES (
  'LEX-API-2026-001',
  'Inly Law Firm',
  NULL,                       -- повне юр. найменування уточнюється
  NULL,                       -- ЄДРПОУ уточнюється
  'info@theinly.com',
  NULL,                       -- юр. адреса уточнюється
  NULL,                       -- підписант уточнюється
  'api_access',
  'draft',
  'UAH',
  'docs/proposals/dogovir-inly-api.pdf',
  NULL,
  '[{"type":"contract","name":"Договір API LEX-API-2026-001","url":"docs/proposals/dogovir-inly-api.pdf"}]'::jsonb,
  'Договір про надання доступу до API SecondLayer (LEX AI). Тарифи — Додаток 1; чинні ціни визначаються білінговою системою і можуть змінюватися. Реквізити Замовника (юр. найменування, ЄДРПОУ, адреса, IBAN, підписант) уточнюються.'
)
ON CONFLICT (contract_number) DO NOTHING;
