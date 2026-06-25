-- =====================================================================
-- postrun-rebuild-indexes.sql
-- Rebuild the secondary QUERY indexes on law_court_citations AFTER the full
-- extraction run completes (they were dropped by prep-full-rebuild-tables.sql
-- to keep the ~700M-row load fast).
--
-- Run ONCE, after extract-citations.py --all has finished:
--   psql "$DATABASE_URL" -f postrun-rebuild-indexes.sql
--
-- Uses CREATE INDEX CONCURRENTLY so the (now live again) table stays readable
-- and is not write-locked. CONCURRENTLY cannot run inside a transaction block,
-- so there is NO BEGIN/COMMIT here. Idempotent via IF NOT EXISTS.
--
-- Building a btree on a few-hundred-million-row table takes a while
-- (tens of minutes each; they are independent and could be launched in
-- parallel psql sessions if you want to shorten wall-clock).
-- =====================================================================

\set ON_ERROR_STOP on

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_article ON law_court_citations (law_article);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_law     ON law_court_citations (law_number);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lcc_type    ON law_court_citations (citation_type);

-- Refresh planner stats after the bulk load + index build.
ANALYZE law_court_citations;
ANALYZE case_citation_edges;

-- Note: idx_lcc_case (btree on court_case_id) is intentionally NOT recreated -
-- the uq_lcc_dedup unique index leads with court_case_id and serves those lookups.
