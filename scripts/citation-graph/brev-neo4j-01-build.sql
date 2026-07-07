-- =====================================================================
-- brev-neo4j-01-build.sql   (runs ON brev host Postgres, db edrsr_local)
-- Build the derived node/edge source tables for the RAW EDRSR citation
-- graph, from the finalized lcc_final / cce_final staging (see
-- local-rebuild-03-finalize.sql) + edrsr_documents.
--
-- RAW model (art_id = md5(law_number|law_article)) — matches the 391.9M
-- CITES_ARTICLE graph that lived on bigbox/qdrant.lex. No legislation
-- registry needed on brev.
--
-- Run (as postgres, peer auth):
--   sudo -u postgres psql -d edrsr_local -v ON_ERROR_STOP=1 \
--        -v min_dec=5 -f brev-neo4j-01-build.sql
-- min_dec = noise filter: keep only articles cited by >= N distinct
-- decisions (5 drops the ~18.7M junk "laws" + singleton tail; proven).
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?min_dec}
\else
  \set min_dec 5
\endif

SET work_mem = '4GB';
SET maintenance_work_mem = '8GB';

-- ---------------------------------------------------------------------
-- 1. Article aggregate (RAW text keys). One row per (law_number, law_article).
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS nb_article;
CREATE UNLOGGED TABLE nb_article AS
SELECT md5(law_number || '|' || law_article)      AS art_id,
       law_number,
       law_article,
       count(*)::bigint                            AS total_citations,
       count(DISTINCT court_case_id)::bigint       AS unique_decisions
FROM lcc_final
GROUP BY law_number, law_article;

CREATE UNIQUE INDEX uq_nb_article    ON nb_article (art_id);
CREATE INDEX        idx_nb_article_kv ON nb_article (law_number, law_article);
ANALYZE nb_article;

-- Kept set: noise filter on unique_decisions.
DROP TABLE IF EXISTS nb_article_kept;
CREATE UNLOGGED TABLE nb_article_kept AS
SELECT * FROM nb_article WHERE unique_decisions >= :min_dec;
CREATE UNIQUE INDEX uq_nb_article_kept    ON nb_article_kept (art_id);
CREATE INDEX        idx_nb_article_kept_kv ON nb_article_kept (law_number, law_article);
ANALYZE nb_article_kept;

-- ---------------------------------------------------------------------
-- 2. Law nodes = distinct law_number among kept articles.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS nb_law;
CREATE UNLOGGED TABLE nb_law AS
SELECT DISTINCT law_number FROM nb_article_kept;
CREATE UNIQUE INDEX uq_nb_law ON nb_law (law_number);
ANALYZE nb_law;

-- ---------------------------------------------------------------------
-- 3. edrsr_case_index — the Case dimension (cause_num) from edrsr_documents.
--    latest_doc_id via ordered array_agg; member_count for the chain tool.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS edrsr_case_index;
CREATE UNLOGGED TABLE edrsr_case_index AS
SELECT cause_num,
       count(*)::int AS member_count,
       (array_agg(doc_id ORDER BY adjudication_date DESC NULLS LAST, doc_id DESC))[1] AS latest_doc_id,
       min(adjudication_date) AS first_date,
       max(adjudication_date) AS last_date
FROM edrsr_documents
WHERE cause_num IS NOT NULL AND cause_num <> ''
GROUP BY cause_num;
CREATE UNIQUE INDEX uq_eci ON edrsr_case_index (cause_num);
ANALYZE edrsr_case_index;

-- ---------------------------------------------------------------------
-- 4. case_citation_links — resolve cce_final.to_case_number -> cause_num.
--    is_self_citation: cited case number == citing decision's own cause_num.
--    (get_case_documents_chain / check_precedent_status source; Neo4j CITES_CASE
--     loads only the resolved, non-self subset.)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS case_citation_links;
CREATE UNLOGGED TABLE case_citation_links AS
SELECT c.from_case_id,
       c.to_case_number,
       (ci.cause_num IS NOT NULL)              AS resolved,
       ci.latest_doc_id,
       ci.member_count,
       (fd.cause_num = c.to_case_number)       AS is_self_citation
FROM cce_final c
LEFT JOIN edrsr_case_index ci ON ci.cause_num = c.to_case_number
LEFT JOIN edrsr_documents  fd ON fd.doc_id   = c.from_case_id;
CREATE INDEX idx_ccl_from ON case_citation_links (from_case_id);
CREATE INDEX idx_ccl_to   ON case_citation_links (to_case_number);
ANALYZE case_citation_links;

-- ---------------------------------------------------------------------
-- Report: node/edge cardinalities for the neo4j-admin import.
-- ---------------------------------------------------------------------
SELECT 'Decision nodes (all edrsr_documents)' AS layer, count(*) AS n FROM edrsr_documents
UNION ALL SELECT 'Article nodes (kept)',   count(*) FROM nb_article_kept
UNION ALL SELECT 'Article nodes (raw, pre-filter)', count(*) FROM nb_article
UNION ALL SELECT 'Law nodes',              count(*) FROM nb_law
UNION ALL SELECT 'Case nodes',             count(*) FROM edrsr_case_index
UNION ALL SELECT 'CITES_ARTICLE (kept)',   count(*) FROM lcc_final l JOIN nb_article_kept a USING (law_number, law_article)
UNION ALL SELECT 'IN_CASE (all decisions with cause_num)', count(*) FROM edrsr_documents WHERE cause_num IS NOT NULL AND cause_num <> ''
UNION ALL SELECT 'CITES_CASE (resolved, non-self)', count(*) FROM case_citation_links WHERE resolved AND NOT is_self_citation
UNION ALL SELECT 'CITES_CASE self-cites (excluded)', count(*) FROM case_citation_links WHERE resolved AND is_self_citation
UNION ALL SELECT 'case edges unresolved (case_not_in_corpus)', count(*) FROM case_citation_links WHERE NOT resolved;
