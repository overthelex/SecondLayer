// backfill-case-cited-by-count.cypher
//
// Materializes the inbound precedent degree onto (:Case).cited_by_count.
//
// WHY: getCaseStats used to compute `COUNT { (c)<-[:CITES_CASE]-(:Decision) }` per
// request. The prod store is ~168G against a 12G page cache, so the in-degree of a
// hot case is tens of thousands of random disk reads -- measured up to 97s. A 5s
// db.transaction.timeout was set on the container, which does not make the query
// fast, it just turns a slow answer into no answer: the callers swallow the error
// (logger.warn) and check_precedent_status silently drops precedent weight.
// Reading a property instead makes it an index seek + one property load.
//
// This statement is BOTH the one-time backfill and the maintenance step run by
// load-case-layer.cypher after every additive load, so the two can never drift.
//
// Idempotent: it recomputes from the edges, so re-running is always safe.
// Only cases with >=1 inbound edge get the property; readers must coalesce(...,0).
// That is sound only because the loader is additive (MERGE, never deletes edges) --
// a count can never need to drop back to zero. If edge deletion is ever introduced,
// this must also reset cases that no longer have inbound edges.
//
// PRE-REQ: db.transaction.timeout must be >= ~10min (or 0). The outer aggregation
// scans every CITES_CASE edge in one transaction, so the 5s prod default kills it.
// Verified 2026-07-21: the 5s timeout blocks this very backfill.
//
// RUN (statement must be its own implicit txn -- `-c`, NOT `--file`, same gotcha as
// load-case-layer.cypher):
//   docker exec -i neo4j-citation cypher-shell -u neo4j -p "$NEOPW" -c "$(sed '/^\/\//d' backfill-case-cited-by-count.cypher)"

MATCH (:Decision)-[r:CITES_CASE]->(c:Case)
WITH c, count(r) AS n
CALL { WITH c, n
  SET c.cited_by_count = n
} IN TRANSACTIONS OF 10000 ROWS;
