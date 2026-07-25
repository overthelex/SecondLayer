\timing on
SET statement_timeout='1800s';
SET work_mem='2GB';
-- LEXAI-1821 Neo4j top-up: statute dash-article layer (КК 111-1 колабораціонізм,
-- КУпАП 173-2 домашнє насильство, ПКУ 297-1, …). Resolved id-keyed, matching the
-- PR #2070 Article schema (art_id = legislation_articles.id as string).
CREATE TEMP TABLE sd AS
  SELECT l.doc_id, l.article_id, l.legislation_id, l.article_number
  FROM legislation_citation_links l
  WHERE l.resolved AND l.article_id IS NOT NULL
    AND l.article_number LIKE '%-%' AND l.article_number NOT LIKE 'п.%';
SELECT count(*) AS edges, count(DISTINCT article_id) AS articles, count(DISTINCT doc_id) AS decisions FROM sd;

\copy (SELECT s.article_id, s.legislation_id, la.article_number, replace(coalesce(la.title,''), E'\n',' ') AS title, count(*) AS total_citations, count(DISTINCT s.doc_id) AS unique_decisions FROM sd s JOIN legislation_articles la ON la.id = s.article_id GROUP BY 1,2,3,4) TO '/tmp/statute_dash_articles.csv' CSV
\copy (SELECT DISTINCT doc_id, article_id FROM sd) TO '/tmp/statute_dash_cites.csv' CSV
