-- LEXAI-1821 cleanup: remove bogus 'п.*' rows produced by the reference-cut transitional
-- boundary (both tonight's and the ORIGINAL import era — the bug is as old as the page's
-- «споживче кредитування» reference). The fixed refetch saved each act in ONE transaction,
-- so every legit row shares that txn timestamp; anything older is stale.
\timing on
SET statement_timeout='1800s';
BEGIN;

CREATE TEMP TABLE fixed_ts AS
  SELECT legislation_id, max(updated_at) AS ts
  FROM legislation_articles
  WHERE legislation_id IN (641, 645, 653)
  GROUP BY 1;
SELECT * FROM fixed_ts;

CREATE TEMP TABLE stale AS
  SELECT la.id, la.legislation_id, la.article_number
  FROM legislation_articles la
  JOIN fixed_ts f ON f.legislation_id = la.legislation_id
  WHERE la.is_current AND la.article_number LIKE 'п.%'
    AND la.updated_at < f.ts - interval '2 minutes';
SELECT legislation_id, count(*) AS stale_rows FROM stale GROUP BY 1;

-- lcl rows bound to soon-deleted articles → honest unresolved (re-resolve follows)
UPDATE legislation_citation_links l
SET resolved=false, article_id=NULL, article_number=NULL, unresolved_reason='article_not_found'
WHERE l.article_id IN (SELECT id FROM stale);

DELETE FROM legislation_articles WHERE id IN (SELECT id FROM stale);

SELECT legislation_id, count(*) AS remaining_pt_rows
FROM legislation_articles
WHERE legislation_id IN (641, 645, 653) AND is_current AND article_number LIKE 'п.%'
GROUP BY 1;
COMMIT;
