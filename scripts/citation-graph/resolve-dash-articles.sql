-- LEXAI-1821 — incremental resolve of statute citations to newly imported dash articles
-- (КК 111-1/111-2/…, КУпАП 173-2/…, ПКУ 19-1/38-1/297-1/…).
\timing on
SET statement_timeout='1800s';
BEGIN;
CREATE TEMP TABLE best AS
  SELECT DISTINCT ON (legislation_id, article_number) legislation_id AS lid, article_number, id AS aid
  FROM legislation_articles
  WHERE article_number LIKE '%-%' AND article_number NOT LIKE 'п.%'
  ORDER BY legislation_id, article_number, is_current DESC, version_date DESC NULLS LAST;
SELECT count(*) AS dash_targets FROM best;

UPDATE legislation_citation_links l
SET article_id = b.aid, article_number = b.article_number,
    resolved = true, unresolved_reason = NULL
FROM best b
WHERE NOT l.resolved AND l.unresolved_reason = 'article_not_found'
  AND l.legislation_id = b.lid
  AND b.article_number = btrim(l.law_article_raw);

SELECT 'newly resolved dash-article citations' AS what, count(*) FROM legislation_citation_links l
JOIN best b ON b.aid = l.article_id
WHERE l.resolved AND l.article_number LIKE '%-%' AND l.article_number NOT LIKE 'п.%';
COMMIT;
