-- =====================================================================
-- prod-load-03-finalize.sql   (runs ON prod, AFTER the COPY)
-- Rebuild indexes on the freshly loaded prod tables and backfill any
-- justice_kind values still NULL (belt-and-suspenders: local already
-- enriched if it had edrsr_documents; this fills the rest from prod's
-- authoritative edrsr_documents).
--
-- CREATE INDEX CONCURRENTLY keeps the (now live) tables readable and cannot
-- run inside a txn block -> NO BEGIN/COMMIT here. Each btree on a ~600M-row
-- table takes tens of minutes; the three secondary ones are independent and
-- may be launched in parallel psql sessions to cut wall-clock.
--
-- Run:
--   psql "$DATABASE_URL" -f prod-load-03-finalize.sql
-- =====================================================================

\set ON_ERROR_STOP on

-- 1. Unique index = dedup guarantee + court_case_id lookups. Built CONCURRENTLY.
--    (Data is pre-deduped on local; if this fails with a uniqueness violation
--    the export was not clean -> investigate before proceeding.)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_lcc_dedup
  ON law_court_citations (court_case_id, citation_type, law_number, law_article);

-- 2. adj_year index first - the enrich UPDATE below filters on it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_adj_year
  ON law_court_citations (adj_year);

-- 3. Backfill justice_kind from the authoritative documents table (fills only
--    rows still NULL). Heavy on ~600M rows but one-shot; run in screen/tmux.
UPDATE law_court_citations t
   SET justice_kind = d.justice_kind
  FROM edrsr_documents d
 WHERE t.court_case_id = d.doc_id
   AND t.justice_kind IS NULL
   AND d.justice_kind IS NOT NULL;

-- 4. Secondary query indexes (independent; parallelizable across sessions).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_article ON law_court_citations (law_article);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_law     ON law_court_citations (law_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_type    ON law_court_citations (citation_type);

-- 5. case_citation_edges indexes + enrich.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_cce_dedup
  ON case_citation_edges (from_case_id, to_case_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cce_adj_year
  ON case_citation_edges (adj_year);

UPDATE case_citation_edges t
   SET justice_kind = d.justice_kind
  FROM edrsr_documents d
 WHERE t.from_case_id = d.doc_id
   AND t.justice_kind IS NULL
   AND d.justice_kind IS NOT NULL;

-- 6. Refresh planner stats.
ANALYZE law_court_citations;
ANALYZE case_citation_edges;

-- Sanity:
--   SELECT citation_type, count(*) FROM law_court_citations GROUP BY 1 ORDER BY 2 DESC;
--   SELECT count(DISTINCT court_case_id) FROM law_court_citations;  -- coverage
--   -- when satisfied, drop the rollback backup:
--   -- DROP TABLE law_court_citations_backup_prerebuild;
