-- Migration 171: widen the opendata_financial_statements unique key to include period_month.
--
-- The prior key (tin, period_year, form_type, c_doc_sub) did not distinguish the reporting
-- period within a year, so a company's Q1 (month 3), half-year (6), 9-month (9) and annual (12)
-- filings of the same form collapsed onto a single row. Include period_month so all periods
-- coexist. Widening a unique key can only reduce collisions, so existing data stays valid.
-- (New imports default a missing period_month to 0 to keep the key non-null and idempotent.)

DROP INDEX IF EXISTS idx_finzvit_tin_year_form;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finzvit_tin_year_month_form
  ON opendata_financial_statements (tin, period_year, period_month, form_type, c_doc_sub);
