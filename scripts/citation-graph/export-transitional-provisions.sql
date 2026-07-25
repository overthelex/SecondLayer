-- LEXAI-1817 — export the transitional-provision citation layer for Neo4j (additive load).
-- Run: docker exec -i secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod < export-transitional-provisions.sql
-- Then: docker cp the two CSVs out and relay them to qdrant.lex:/home/ubuntu/neo4j/import/
-- Load with: load-transitional-layer.cypher
--
-- Dash-origin exclusion (LEXAI-1818): the extractor normalises dash-points
-- («п. 16-1 підрозділу 10» → '16.1'), which COLLIDES with the main-body point numbering —
-- the resolver then binds ст.16 п.16.1 («обов'язки платника») instead of the військовий
-- збір point. A row is dash-origin when its lcc citation_context still shows the dash form;
-- such rows are excluded here and marked resolved=false / 'dash_point_collision' in lcl.
\timing on
SET statement_timeout='1200s';
CREATE TEMP TABLE tp AS
  SELECT l.doc_id, l.article_id, l.resolved, l.law_article_raw,
         (c.citation_context LIKE '%' || replace(l.law_article_raw, '.', '-') || '%') AS dash_origin
  FROM legislation_citation_links l
  JOIN law_court_citations c ON c.id = l.src_citation_id
  WHERE l.citation_type='transitional_provision';
SELECT resolved, dash_origin, count(*) FROM tp GROUP BY 1,2 ORDER BY 3 DESC;
\copy (SELECT t.article_id, 641 AS legislation_id, la.article_number, replace(coalesce(la.title,''), E'\n', ' ') AS title, count(*) AS total_citations, count(DISTINCT t.doc_id) AS unique_decisions FROM tp t JOIN legislation_articles la ON la.id = t.article_id WHERE t.resolved AND NOT t.dash_origin GROUP BY 1,2,3,4) TO '/tmp/transitional_articles.csv' CSV
\copy (SELECT DISTINCT t.doc_id, t.article_id FROM tp t WHERE t.resolved AND NOT t.dash_origin) TO '/tmp/transitional_cites.csv' CSV
SELECT 'clean articles', count(DISTINCT article_id) FROM tp WHERE resolved AND NOT dash_origin;

-- One-off mitigation applied 2026-07-03 (documented for reproducibility; idempotent):
-- UPDATE legislation_citation_links l SET resolved=false, unresolved_reason='dash_point_collision'
-- FROM law_court_citations c
-- WHERE c.id = l.src_citation_id AND l.citation_type='transitional_provision' AND l.resolved
--   AND c.citation_context LIKE '%' || replace(l.law_article_raw, '.', '-') || '%';
