-- =====================================================================
-- prod-load-01-prep.sql   (runs ON prod)
-- Prepare prod tables to receive the pre-deduped local export via COPY.
--
-- Because the incoming data is ALREADY deduped on local, prod does a pure
-- append-only COPY with NO indexes maintained during load (drop them all,
-- including the unique index — there are no conflicts to arbitrate). All
-- indexes are (re)built afterwards in prod-load-03-finalize.sql.
--
-- DESTRUCTIVE: TRUNCATEs law_court_citations + case_citation_edges. A guarded
-- backup of the current law_court_citations is taken first (rollback path).
--
-- Run ONCE, immediately before the COPY:
--   psql "$DATABASE_URL" -f prod-load-01-prep.sql
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Guarded safety backup (skip if one already exists from a prior attempt).
DO $$
BEGIN
  IF to_regclass('public.law_court_citations_backup_prerebuild') IS NULL THEN
    EXECUTE 'CREATE TABLE law_court_citations_backup_prerebuild AS TABLE law_court_citations';
    RAISE NOTICE 'Backup created: law_court_citations_backup_prerebuild (% rows)',
      (SELECT count(*) FROM law_court_citations_backup_prerebuild);
  ELSE
    RAISE NOTICE 'Backup already exists - skipping';
  END IF;
END $$;

-- 2. Columns the refined pipeline carries (no-op if prep-full-rebuild already ran).
ALTER TABLE law_court_citations ADD COLUMN IF NOT EXISTS justice_kind smallint;
ALTER TABLE law_court_citations ADD COLUMN IF NOT EXISTS adj_year     smallint;

-- 3. case_citation_edges target (create if first run).
CREATE TABLE IF NOT EXISTS case_citation_edges (
  id               bigserial PRIMARY KEY,
  from_case_id     bigint   NOT NULL,
  to_case_number   text     NOT NULL,
  citation_context text     DEFAULT '',
  justice_kind     smallint,
  adj_year         smallint,
  created_at       timestamptz DEFAULT now()
);

-- 4. Clear both targets. Backup of law_court_citations retained above.
TRUNCATE law_court_citations RESTART IDENTITY;
TRUNCATE case_citation_edges  RESTART IDENTITY;

-- 5. Drop EVERY secondary/unique index for the load. Data is pre-deduped, so
--    the unique index is not needed as a conflict arbiter during COPY; it is
--    rebuilt (and re-validates uniqueness) in finalize. Keeping any btree
--    maintained across a ~600M-row COPY is the dominant avoidable cost.
DROP INDEX IF EXISTS uq_lcc_dedup;
DROP INDEX IF EXISTS idx_lcc_adj_year;
DROP INDEX IF EXISTS idx_lcc_article;
DROP INDEX IF EXISTS idx_lcc_law;
DROP INDEX IF EXISTS idx_lcc_type;
DROP INDEX IF EXISTS idx_lcc_case;
DROP INDEX IF EXISTS uq_cce_dedup;
DROP INDEX IF EXISTS idx_cce_adj_year;

COMMIT;

-- After this: COPY the data in (prod-load-02-copy-index.sh), then build
-- indexes + enrich (prod-load-03-finalize.sql).
