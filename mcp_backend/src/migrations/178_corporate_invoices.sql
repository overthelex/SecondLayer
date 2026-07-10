-- Migration 178: corporate invoices, linked to corporate_contracts.
-- Stores issued invoices (рахунки) for corporate API-access clients.

CREATE TABLE IF NOT EXISTS corporate_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(64)  UNIQUE NOT NULL,
  contract_id      UUID REFERENCES corporate_contracts(id) ON DELETE SET NULL,
  contract_number  VARCHAR(64),
  client_name      VARCHAR(255),
  amount           NUMERIC(14, 2) NOT NULL,
  vat_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency         VARCHAR(8)   NOT NULL DEFAULT 'UAH',
  status           VARCHAR(32)  NOT NULL DEFAULT 'draft', -- draft|issued|paid|overdue|cancelled
  issue_date       DATE,
  due_date         DATE,
  paid_at          TIMESTAMPTZ,
  document_url     TEXT,
  payment_purpose  TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_invoices_status   ON corporate_invoices(status);
CREATE INDEX IF NOT EXISTS idx_corporate_invoices_contract ON corporate_invoices(contract_number);

-- Seed: first invoice for the Inly Law Firm contract (initial balance top-up, prepaid).
INSERT INTO corporate_invoices (
  invoice_number, contract_id, contract_number, client_name,
  amount, vat_amount, currency, status, document_url, payment_purpose, notes
) VALUES (
  'LEX-INV-2026-001',
  (SELECT id FROM corporate_contracts WHERE contract_number = 'LEX-API-2026-001'),
  'LEX-API-2026-001',
  'Inly Law Firm',
  4449.50,
  0,
  'UAH',
  'draft',
  'docs/proposals/rakhunok-inly-inv-001.pdf',
  'Оплата за доступ до API згідно з Договором № LEX-API-2026-001 та Рахунком № LEX-INV-2026-001, без ПДВ',
  'Поповнення балансу (передоплата). Грошовий еквівалент 100,00 USD = 4 449,50 грн за офіційним курсом НБУ 44,4950 (13.07.2026), ст. 524/533 ЦКУ. Спрощена система, ПДВ не нараховується.'
)
ON CONFLICT (invoice_number) DO NOTHING;

-- Link the invoice back onto the contract row.
UPDATE corporate_contracts
SET invoice_url = 'docs/proposals/rakhunok-inly-inv-001.pdf',
    documents = documents || '[{"type":"invoice","name":"Рахунок LEX-INV-2026-001","url":"docs/proposals/rakhunok-inly-inv-001.pdf"}]'::jsonb,
    updated_at = NOW()
WHERE contract_number = 'LEX-API-2026-001'
  AND NOT (documents @> '[{"type":"invoice","name":"Рахунок LEX-INV-2026-001"}]'::jsonb);
