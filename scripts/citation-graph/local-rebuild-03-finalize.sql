-- =====================================================================
-- local-rebuild-03-finalize.sql   (runs ON local / cthulhu)
-- Stage-3: turn the raw UNLOGGED staging heaps (lcc_bulk / cce_bulk) into
-- clean, deduped, indexed, enriched tables ready to export to prod.
--
-- Steps: dedup (DISTINCT ON the unique key) -> build indexes on the smaller
-- deduped table -> enrich justice_kind from edrsr_documents (source of truth;
-- edrsr_fulltext.justice_kind is only ~2% populated).
--
-- Benchmark reference: 16M raw -> 10.4M dedup + indexes in 14s. The full
-- corpus (~1B raw) is a large DISTINCT ON sort; budget ~30-60 min. Give the
-- session room: run with a generous work_mem (set below, session-scoped).
--
-- Run:
--   docker exec -i secondlayer-postgres-local \
--     psql -U "$PU" -d "$PD" -f - < local-rebuild-03-finalize.sql
-- =====================================================================

\set ON_ERROR_STOP on

-- Big sort/hash for the one-shot dedup. Session-scoped, reverted on disconnect.
SET work_mem = '2GB';
SET maintenance_work_mem = '4GB';

-- 1. Statute citations: dedup on the canonical key. DISTINCT ON keeps the
--    first row per (court_case_id, citation_type, law_number, law_article).
DROP TABLE IF EXISTS lcc_final;
CREATE UNLOGGED TABLE lcc_final AS
  SELECT DISTINCT ON (court_case_id, citation_type, law_number, law_article)
         court_case_id, citation_type, law_number, law_article,
         citation_context, justice_kind, adj_year
  FROM lcc_bulk
  ORDER BY court_case_id, citation_type, law_number, law_article;

CREATE UNIQUE INDEX uq_lcc_final
  ON lcc_final (court_case_id, citation_type, law_number, law_article);
CREATE INDEX idx_lcc_final_adj_year ON lcc_final (adj_year);

-- 2. Case-number edges: dedup on (from_case_id, to_case_number).
DROP TABLE IF EXISTS cce_final;
CREATE UNLOGGED TABLE cce_final AS
  SELECT DISTINCT ON (from_case_id, to_case_number)
         from_case_id, to_case_number, citation_context, justice_kind, adj_year
  FROM cce_bulk
  ORDER BY from_case_id, to_case_number;

CREATE UNIQUE INDEX uq_cce_final ON cce_final (from_case_id, to_case_number);
CREATE INDEX idx_cce_final_adj_year ON cce_final (adj_year);

-- 3. Enrich justice_kind from edrsr_documents IF that table exists locally.
--    Guarded so this script also works on a box without the documents table
--    (in which case enrichment is deferred to the prod side after load).
DO $$
BEGIN
  IF to_regclass('public.edrsr_documents') IS NOT NULL THEN
    UPDATE lcc_final t
       SET justice_kind = d.justice_kind
      FROM edrsr_documents d
     WHERE t.court_case_id = d.doc_id
       AND t.justice_kind IS NULL
       AND d.justice_kind IS NOT NULL;
    RAISE NOTICE 'lcc_final justice_kind enriched';

    UPDATE cce_final t
       SET justice_kind = d.justice_kind
      FROM edrsr_documents d
     WHERE t.from_case_id = d.doc_id
       AND t.justice_kind IS NULL
       AND d.justice_kind IS NOT NULL;
    RAISE NOTICE 'cce_final justice_kind enriched';
  ELSE
    RAISE NOTICE 'edrsr_documents not present locally - enrich on prod after load';
  END IF;
END $$;

ANALYZE lcc_final;
ANALYZE cce_final;

-- Report: raw vs deduped + type breakdown (sanity-check the phantom-codex fix).
SELECT 'lcc raw'   AS t, count(*) FROM lcc_bulk
UNION ALL SELECT 'lcc dedup', count(*) FROM lcc_final
UNION ALL SELECT 'cce raw',   count(*) FROM cce_bulk
UNION ALL SELECT 'cce dedup', count(*) FROM cce_final;

SELECT citation_type, count(*) AS n,
       count(DISTINCT court_case_id) AS decisions
FROM lcc_final GROUP BY citation_type ORDER BY n DESC;

-- distinct decisions covered (compare against ~120-140M corpus; old stale
-- table only covered ~35M):
SELECT count(DISTINCT court_case_id) AS decisions_with_statute_citation FROM lcc_final;
