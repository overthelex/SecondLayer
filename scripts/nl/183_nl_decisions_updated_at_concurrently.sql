-- Index for the substrate /changes feed (LEXAI-1902).
--
-- GET /api/v1/substrate/nl/changes?since=... asks for the rows updated after a
-- timestamp, newest cursor last. It is the one endpoint an integrator polls in a
-- loop, and it was the slowest thing in the contract: 12.5s over the wire.
--
-- EXPLAIN ANALYZE on prod, since=2026-07-25, limit 2:
--   Parallel Seq Scan on nl_rechtspraak_decisions, 6 workers
--   Buffers: shared hit=53,864 read=668,131
--   JIT 1,455ms, Execution Time 11,932ms
-- There was no index on updated_at at all, so every poll read the whole 28GB
-- table to return two rows.
--
-- Kept out of the numbered migrations for the same reason as 179b: the runner
-- sends a file as one query inside an implicit transaction, and CREATE INDEX
-- CONCURRENTLY cannot run there, while a plain build would hold a write lock on
-- a live 3.7M-row table.
--
-- Run:
--   scp scripts/nl/183_nl_decisions_updated_at_concurrently.sql prod:/tmp/
--   ssh prod "docker cp /tmp/183_nl_decisions_updated_at_concurrently.sql \
--     secondlayer-postgres-prod:/tmp/ && docker exec secondlayer-postgres-prod \
--     psql -U secondlayer -d secondlayer_prod -f /tmp/183_nl_decisions_updated_at_concurrently.sql"
--
-- An interrupted CONCURRENTLY build leaves an INVALID index behind, so the
-- verification at the bottom is part of the run, not an optional extra.

\timing on

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nl_recht_updated_at
    ON nl_rechtspraak_decisions (updated_at);

-- ---------------------------------------------------------------------------
-- Verify: the index must be valid, and the feed query must use it.
-- ---------------------------------------------------------------------------
SELECT indexrelid::regclass AS invalid_index
FROM pg_index WHERE NOT indisvalid;

EXPLAIN (ANALYZE, BUFFERS)
SELECT ecli, court_name, decision_date, updated_at
  FROM nl_rechtspraak_decisions
 WHERE updated_at >= '2026-07-25T00:00:00Z'::timestamptz
 ORDER BY updated_at ASC
 LIMIT 2;
