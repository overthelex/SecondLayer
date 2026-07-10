-- Migration 170: align the full-text GIN indexes on the M&A/antitrust demo tables
-- with the expression emitted by the registry search builder (query-ir 'fts_simple':
--   to_tsvector('simple', <col>)  — WITHOUT coalesce).
-- Migration 169 created them as to_tsvector('simple', coalesce(<col>,'')), which the
-- planner cannot match to the fts_simple predicate, so search_registry would seq-scan.
-- Recreate them in the matching form. (to_tsvector on NULL yields NULL → simply not indexed.)

DROP INDEX IF EXISTS idx_amcu_bid_name;
CREATE INDEX IF NOT EXISTS idx_amcu_bid_name ON opendata_amcu_bid_rigging USING gin(to_tsvector('simple', entity_name));

DROP INDEX IF EXISTS idx_amcu_dec_body;
CREATE INDEX IF NOT EXISTS idx_amcu_dec_body ON opendata_amcu_decisions USING gin(to_tsvector('simple', body_text));

DROP INDEX IF EXISTS idx_stenogram_body;
CREATE INDEX IF NOT EXISTS idx_stenogram_body ON opendata_rada_stenograms USING gin(to_tsvector('simple', body_text));
