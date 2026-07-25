-- =====================================================================
-- local-rebuild-01-prep.sql   (runs ON local / cthulhu)
-- Stage-1 of the full EDRSR citation rebuild on the 16-core local box.
--
-- Strategy: DEFERRED-INDEX BULK LOAD. The extractor streams raw citations
-- into UNLOGGED, INDEX-FREE staging tables (fastest possible insert path,
-- benchmarked ~25% faster end-to-end than inline unique-index + ON CONFLICT).
-- Dedup + indexing happen afterwards in local-rebuild-03-finalize.sql.
--
-- This script is NON-DESTRUCTIVE to the existing 502M-row law_court_citations
-- baseline: it only (re)creates the lcc_bulk / cce_bulk staging tables. The
-- stale baseline and its mv_citations_by_year stay untouched until the rebuild
-- is validated and exported to prod.
--
-- Run ONCE before launching the extractor:
--   docker exec -i secondlayer-postgres-local \
--     psql -U "$PU" -d "$PD" -f - < local-rebuild-01-prep.sql
-- (or pipe via the wrapper in local-rebuild-02-run.sh, which sources .env.local)
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Raw statute-citation sink. No PK, no unique index, no ON CONFLICT during
-- load -> every INSERT is a pure heap append. UNLOGGED skips WAL (this data
-- is reproducible from edrsr_fulltext, so crash-durability is unnecessary).
DROP TABLE IF EXISTS lcc_bulk;
CREATE UNLOGGED TABLE lcc_bulk (
  court_case_id    bigint,
  citation_type    text,
  law_number       text,
  law_article      text,
  citation_context text,
  justice_kind     smallint,
  adj_year         smallint
);

-- Raw decision->case-number edge sink (proto decision<->decision graph;
-- case numbers resolved to doc_ids in a later phase, off the critical path).
DROP TABLE IF EXISTS cce_bulk;
CREATE UNLOGGED TABLE cce_bulk (
  from_case_id     bigint,
  to_case_number   text,
  citation_context text,
  justice_kind     smallint,
  adj_year         smallint
);

COMMIT;

-- Sanity:
--   \d+ lcc_bulk
--   SELECT count(*) FROM law_court_citations;  -- 502M stale baseline, untouched
