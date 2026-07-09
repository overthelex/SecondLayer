-- 166_ip_dossier_columns.sql
-- LEXAI-1835: persist the UIPV/NIPO SIS "dossier" — document flow (data_docs)
-- and fee/payment history (data_payments) — for trademarks and patents.
--
-- These two fields live at the TOP level of each SIS open-data record (siblings
-- of the inner `data` object). The importers previously stored only `data`
-- into raw_data, so the dossier was lost. We add dedicated JSONB columns so
-- search_registry can surface документообіг + платежі (e.g. cause of a
-- trademark's early termination, держмито/renewal fee history).

ALTER TABLE opendata_trademarks ADD COLUMN IF NOT EXISTS data_payments JSONB;
ALTER TABLE opendata_trademarks ADD COLUMN IF NOT EXISTS data_docs     JSONB;

ALTER TABLE opendata_patents    ADD COLUMN IF NOT EXISTS data_payments JSONB;
ALTER TABLE opendata_patents    ADD COLUMN IF NOT EXISTS data_docs     JSONB;
