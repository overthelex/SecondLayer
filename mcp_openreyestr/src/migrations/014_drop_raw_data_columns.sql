-- Migration 014: Drop raw_data JSONB columns from arma_assets, nazk_declarations, prozorro_tenders
--
-- These columns store full API responses alongside structured columns that cover all
-- query/response needs. None of the service/API layer SELECT queries read raw_data —
-- only import scripts write to it. Dropping frees ~1.5 GB of storage:
--   arma_assets    raw_data  ~576 MB  (full JSON record per seized asset)
--   nazk_declarations raw_data ~883 MB + ~394 MB TOAST (full declaration API response)
--   prozorro_tenders raw_data ~665 MB  (compact tender metadata JSON)
--
-- After dropping, import scripts that INSERT/UPDATE raw_data will fail on these tables.
-- Those scripts must be updated to remove raw_data from INSERT column lists and
-- ON CONFLICT UPDATE clauses before the next import run.

ALTER TABLE arma_assets DROP COLUMN IF EXISTS raw_data;

ALTER TABLE nazk_declarations DROP COLUMN IF EXISTS raw_data;

ALTER TABLE prozorro_tenders DROP COLUMN IF EXISTS raw_data;
