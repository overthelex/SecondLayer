-- Index changes on nl_rechtspraak_decisions (LEXAI-1881).
--
-- Kept out of migration 179 on purpose: the table is 28GB and the migration
-- runner sends the whole file as one query, which Postgres wraps in an implicit
-- transaction. CREATE INDEX CONCURRENTLY cannot run there, and a non-concurrent
-- build would hold a write lock on a live table for many minutes.
--
-- Run statement by statement, on an idle-ish window:
--   scp scripts/nl/179b_nl_decisions_indexes_concurrently.sql prod:/tmp/
--   ssh prod "docker cp /tmp/179b_nl_decisions_indexes_concurrently.sql \
--     secondlayer-postgres-prod:/tmp/ && docker exec secondlayer-postgres-prod \
--     psql -U secondlayer -d secondlayer_prod -f /tmp/179b_nl_decisions_indexes_concurrently.sql"
--
-- If a CONCURRENTLY build is interrupted it leaves an INVALID index behind;
-- check with:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- and DROP INDEX CONCURRENTLY the invalid one before retrying.

\timing on

-- ---------------------------------------------------------------------------
-- 1. Replace the full-text index.
--
-- The existing idx_nl_recht_fts is 3,372 MB and has had 0 scans. Three things
-- are wrong with it: it uses the 'simple' config (no Dutch stemming or
-- stopwords, on a language with heavy compounding and inflection), it indexes
-- `parties`, which is NULL in 100% of rows, and it covers all 3.6M rows when
-- only 946k have any text at all.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nl_fts_dutch
    ON nl_rechtspraak_decisions
    USING GIN (to_tsvector('dutch', coalesce(summary, '') || ' ' || coalesce(full_text, '')))
    WHERE full_text IS NOT NULL;

DROP INDEX CONCURRENTLY IF EXISTS idx_nl_recht_fts;

-- ---------------------------------------------------------------------------
-- 2. Filters the search tool will actually use.
-- ---------------------------------------------------------------------------

-- rechtsgebied filter: 3.16M rows carry subject_areas and none of it is indexed
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nl_subject_areas
    ON nl_rechtspraak_decisions USING GIN (subject_areas);

-- "latest from court X": replaces two single-column indexes that see almost no use
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nl_court_date
    ON nl_rechtspraak_decisions (court_code, decision_date DESC);

-- case-number lookup, needed to pair PHR conclusions with their Hoge Raad
-- decision and to walk the instance ladder (pg_trgm is already installed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nl_case_number_trgm
    ON nl_rechtspraak_decisions USING GIN (case_number gin_trgm_ops);

-- operational queries such as `metadata_json ? 'identifier'`, which the
-- consistency audit runs and which are a seq scan over 28GB today
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nl_metadata_jsonb
    ON nl_rechtspraak_decisions USING GIN (metadata_json jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- 3. Verify.
-- ---------------------------------------------------------------------------
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size, idx_scan
FROM pg_stat_user_indexes
WHERE relname = 'nl_rechtspraak_decisions'
ORDER BY pg_relation_size(indexrelid) DESC;

SELECT indexrelid::regclass AS invalid_index
FROM pg_index WHERE NOT indisvalid;
