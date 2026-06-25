-- =====================================================================
-- prep-full-rebuild-tables.sql
-- Prepare PROD tables for the full EDRSR citation extraction run.
--
-- Strategy: TRUNCATE + full rebuild. All DDL below runs on EMPTY tables,
-- so it is effectively instant (< 1 min incl. the safety backup).
--
-- Safe to re-run: idempotent (IF NOT EXISTS / IF EXISTS / guarded backup).
-- DESTRUCTIVE: it TRUNCATEs law_court_citations. The backup table created
-- in step 1 is your rollback path.
--
-- Run ONCE, immediately before launching the extractor:
--   psql "$DATABASE_URL" -f prep-full-rebuild-tables.sql
--   nice -n 10 python3 extract-citations.py --all --workers 8
--
-- AFTER the extractor finishes, run postrun-rebuild-indexes.sql to rebuild
-- the secondary query indexes that step 4 drops for load speed.
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Safety backup of the current table (snapshot). Guarded so a re-run
--    never clobbers an existing backup.
DO $$
BEGIN
  IF to_regclass('public.law_court_citations_backup_prerebuild') IS NULL THEN
    EXECUTE 'CREATE TABLE law_court_citations_backup_prerebuild AS TABLE law_court_citations';
    RAISE NOTICE 'Backup created: law_court_citations_backup_prerebuild (% rows)',
      (SELECT count(*) FROM law_court_citations_backup_prerebuild);
  ELSE
    RAISE NOTICE 'Backup law_court_citations_backup_prerebuild already exists - skipping';
  END IF;
END $$;

-- 2. New columns the refined pipeline writes (nullable, no default ->
--    metadata-only, instant). justice_kind is backfilled per-year by the
--    extractor's enrich step; adj_year is set on insert.
ALTER TABLE law_court_citations ADD COLUMN IF NOT EXISTS justice_kind smallint;
ALTER TABLE law_court_citations ADD COLUMN IF NOT EXISTS adj_year     smallint;

-- 3. Clear the old batch (~384K real + ~120K ГПК phantom rows). Backup retained.
TRUNCATE law_court_citations RESTART IDENTITY;

-- 4. Drop secondary QUERY indexes for the duration of the load. Maintaining
--    these on every one of ~700M inserts is pure overhead during a rebuild;
--    they are recreated post-run. idx_lcc_case is dropped permanently - it is
--    redundant with the new unique index's leading column (court_case_id).
DROP INDEX IF EXISTS idx_lcc_article;
DROP INDEX IF EXISTS idx_lcc_law;
DROP INDEX IF EXISTS idx_lcc_type;
DROP INDEX IF EXISTS idx_lcc_case;

-- 5. Unique index = dedup + the conflict arbiter for `ON CONFLICT DO NOTHING`.
--    Built on the empty table = instant. Kept during the load (required).
--    Its leading column also serves court_case_id lookups (replaces idx_lcc_case).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lcc_dedup
  ON law_court_citations (court_case_id, citation_type, law_number, law_article);

-- 6. adj_year index = needed for the per-year enrich UPDATE (justice_kind
--    backfill filters on adj_year). Without it each year's enrich would
--    seq-scan the whole growing table. Kept during the load.
CREATE INDEX IF NOT EXISTS idx_lcc_adj_year ON law_court_citations (adj_year);

-- 7. case_citation_edges: decision -> referenced case-number raw edges
--    (proto decision<->decision graph; case numbers are resolved to doc_ids
--    in a later step). to_case_number stays text until resolution.
CREATE TABLE IF NOT EXISTS case_citation_edges (
  id               bigserial PRIMARY KEY,
  from_case_id     bigint   NOT NULL,
  to_case_number   text     NOT NULL,
  citation_context text     DEFAULT '',
  justice_kind     smallint,
  adj_year         smallint,
  created_at       timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cce_dedup
  ON case_citation_edges (from_case_id, to_case_number);
CREATE INDEX IF NOT EXISTS idx_cce_adj_year ON case_citation_edges (adj_year);

COMMIT;

-- Sanity check (run manually after):
--   \d law_court_citations
--   \d case_citation_edges
--   SELECT count(*) FROM law_court_citations_backup_prerebuild;  -- old rows preserved
--   SELECT count(*) FROM law_court_citations;                    -- expect 0 before run
