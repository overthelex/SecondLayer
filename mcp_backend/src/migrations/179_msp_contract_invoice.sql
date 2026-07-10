-- Migration 179: second corporate contract + invoice — МСП (Mykhailiuk, Sorokolat & Partners).
-- Client: ТОВ «Михайлюк, Сороколат і Партнери-Патентні повірені», ЄДРПОУ 32133725.

INSERT INTO corporate_contracts (
  contract_number, client_name, client_legal_name, client_edrpou, client_email,
  client_address, client_signatory, contract_type, status, currency,
  contract_document_url, invoice_url, documents, notes
) VALUES (
  'LEX-API-2026-002',
  'МСП (Михайлюк, Сороколат і Партнери)',
  'ТОВ «Михайлюк, Сороколат і Партнери-Патентні повірені»',
  '32133725',
  'opposition@mspcorporate.com',
  NULL,                       -- юр. адреса уточнюється (немає в ЄДР-вибірці)
  'Михайлюк Ганна Валентинівна',
  'api_access',
  'draft',
  'UAH',
  'docs/proposals/dogovir-msp-api.pdf',
  'docs/proposals/rakhunok-msp-inv-002.pdf',
  '[{"type":"contract","name":"Договір API LEX-API-2026-002","url":"docs/proposals/dogovir-msp-api.pdf"},{"type":"invoice","name":"Рахунок LEX-INV-2026-002","url":"docs/proposals/rakhunok-msp-inv-002.pdf"}]'::jsonb,
  'Договір про надання доступу до API SecondLayer (LEX AI). Патентні повірені (IP-практика). Тарифи — Додаток 1; чинні ціни — у білінгу. Реквізити Замовника (адреса, IBAN) уточнюються.'
)
ON CONFLICT (contract_number) DO NOTHING;

INSERT INTO corporate_invoices (
  invoice_number, contract_id, contract_number, client_name,
  amount, vat_amount, currency, status, document_url, payment_purpose, notes
) VALUES (
  'LEX-INV-2026-002',
  (SELECT id FROM corporate_contracts WHERE contract_number = 'LEX-API-2026-002'),
  'LEX-API-2026-002',
  'МСП (Михайлюк, Сороколат і Партнери)',
  4449.50,
  0,
  'UAH',
  'draft',
  'docs/proposals/rakhunok-msp-inv-002.pdf',
  'Оплата за доступ до API згідно з Договором № LEX-API-2026-002 та Рахунком № LEX-INV-2026-002, без ПДВ',
  'Поповнення балансу (передоплата). Грошовий еквівалент 100,00 USD = 4 449,50 грн за офіційним курсом НБУ 44,4950 (13.07.2026), ст. 524/533 ЦКУ. Спрощена система, ПДВ не нараховується.'
)
ON CONFLICT (invoice_number) DO NOTHING;
