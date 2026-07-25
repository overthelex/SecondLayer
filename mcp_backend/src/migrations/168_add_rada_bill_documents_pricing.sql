-- Migration 168: Pricing for the new rada_search_bill_documents tool.
-- Non-LLM DB/FTS lookup (ГНЕУ conclusions + bill supporting documents), priced like
-- rada_search_parliament_bills at its post-139 reduced base cost. Idempotent.

INSERT INTO tool_pricing (tool_name, service, display_name, base_cost_usd, notes)
VALUES (
  'rada_search_bill_documents',
  'rada',
  'Пошук документів законопроєктів (ГНЕУ, висновки комітетів)',
  0.00100000,
  'FTS по вердиктах ГНЕУ/комітетів + назві законопроєкту; DB lookup, без LLM'
)
ON CONFLICT (tool_name) DO NOTHING;
