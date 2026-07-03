-- LEXAI-1818 — repair dash-origin transitional rows to their truthful dash form.
-- A row is dash-origin when its lcc citation_context still shows the dash rendering
-- (e.g. law_article='16.1' with context «п. 16-1 підрозділу 10»).
\timing on
SET statement_timeout='1200s';
BEGIN;

-- 1. Collect the affected pairs once (lcc context is the source of truth).
CREATE TEMP TABLE dash_rows AS
  SELECT c.id AS lcc_id, l.id AS lcl_id, c.law_article AS old_article,
         replace(c.law_article, '.', '-') AS new_article
  FROM law_court_citations c
  JOIN legislation_citation_links l ON l.src_citation_id = c.id
  WHERE c.citation_type = 'transitional_provision'
    AND c.citation_context LIKE '%' || replace(c.law_article, '.', '-') || '%';
SELECT old_article, new_article, count(*) FROM dash_rows GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10;

-- 2. lcc: truthful dash form (no collision possible: no dash rows exist yet, and the
--    unique key holds one row per (doc, type, law, article)).
UPDATE law_court_citations c SET law_article = d.new_article
FROM dash_rows d WHERE c.id = d.lcc_id;

-- 3. lcl: truthful raw form; drop the WRONG binding entirely (article_id pointed at the
--    main-body article); honest unresolved state until the sectionizer ticket imports
--    the dash-point rows — a resolver re-run then binds 'п.'||law_article_raw exactly.
UPDATE legislation_citation_links l
SET law_article_raw = d.new_article,
    article_id = NULL, article_number = NULL,
    resolved = false, unresolved_reason = 'article_not_found'
FROM dash_rows d WHERE l.id = d.lcl_id;

SELECT 'lcc dash forms', law_article, count(*) FROM law_court_citations
WHERE citation_type='transitional_provision' AND law_article LIKE '%-%' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 8;
SELECT 'lcl leftover collisions', count(*) FROM legislation_citation_links
WHERE citation_type='transitional_provision' AND unresolved_reason='dash_point_collision';
COMMIT;
