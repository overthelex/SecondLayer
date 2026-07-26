-- LEXAI-1883: score the text extractor against the edges dcterms:references
-- provides for free.
--
-- Read the numbers carefully. The RDF list is what the court's editor tagged as
-- the relevant provisions, not every statute the judgment mentions, so a text
-- edge missing from it is not automatically wrong. Agreement is therefore
-- reported in shared_docs directions and interpreted, not collapsed into one "accuracy".
--
-- Only decisions that have BOTH kinds of edge are compared; anything else would
-- measure coverage, not correctness.
SET max_parallel_workers_per_gather = 6;

WITH norm AS (
    SELECT from_ecli, cite_kind,
           -- the source names the same act two ways; strip the qualifier so
           -- "Wetboek van Burgerlijke Rechtsvordering (geldt in geval van
           -- digitaal procederen)" and the plain name compare equal
           btrim(regexp_replace(law_name_raw, '\s*\(.*\)$', '')) AS law,
           article
    FROM nl_legislation_citations
    WHERE article IS NOT NULL
),
shared_docs AS (
    SELECT DISTINCT from_ecli FROM norm WHERE cite_kind = 'text'
    INTERSECT
    SELECT DISTINCT from_ecli FROM norm WHERE cite_kind = 'rdf'
),
t AS (SELECT DISTINCT n.* FROM norm n JOIN shared_docs USING (from_ecli) WHERE cite_kind = 'text'),
r AS (SELECT DISTINCT n.* FROM norm n JOIN shared_docs USING (from_ecli) WHERE cite_kind = 'rdf')
SELECT (SELECT count(*) FROM shared_docs)                                    AS decisions_compared,
       (SELECT count(*) FROM t)                                       AS text_edges,
       (SELECT count(*) FROM r)                                       AS rdf_edges,
       (SELECT count(*) FROM t JOIN r USING (from_ecli, law, article)) AS agreeing,
       round(100.0 * (SELECT count(*) FROM t JOIN r USING (from_ecli, law, article))
                   / NULLIF((SELECT count(*) FROM t), 0), 1)          AS pct_of_text_confirmed,
       round(100.0 * (SELECT count(*) FROM t JOIN r USING (from_ecli, law, article))
                   / NULLIF((SELECT count(*) FROM r), 0), 1)          AS pct_of_rdf_found;

\echo == where the two disagree, by law: is it us or is it the editor being selective ==
WITH norm AS (
    SELECT from_ecli, cite_kind,
           btrim(regexp_replace(law_name_raw, '\s*\(.*\)$', '')) AS law, article
    FROM nl_legislation_citations WHERE article IS NOT NULL
),
shared_docs AS (SELECT DISTINCT from_ecli FROM norm WHERE cite_kind='text'
         INTERSECT SELECT DISTINCT from_ecli FROM norm WHERE cite_kind='rdf'),
t AS (SELECT DISTINCT n.* FROM norm n JOIN shared_docs USING (from_ecli) WHERE cite_kind='text'),
r AS (SELECT DISTINCT n.* FROM norm n JOIN shared_docs USING (from_ecli) WHERE cite_kind='rdf')
SELECT t.law,
       count(*) AS text_edges,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM r
             WHERE r.from_ecli=t.from_ecli AND r.law=t.law AND r.article=t.article)) AS confirmed_by_rdf
FROM t GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

\echo == a few text edges the RDF does not list, to eyeball whether they are real ==
WITH norm AS (
    SELECT from_ecli, cite_kind,
           btrim(regexp_replace(law_name_raw, '\s*\(.*\)$', '')) AS law, article
    FROM nl_legislation_citations WHERE article IS NOT NULL
),
shared_docs AS (SELECT DISTINCT from_ecli FROM norm WHERE cite_kind='text'
         INTERSECT SELECT DISTINCT from_ecli FROM norm WHERE cite_kind='rdf')
SELECT t.from_ecli, t.law, t.article
FROM norm t JOIN shared_docs USING (from_ecli)
WHERE t.cite_kind='text'
  AND NOT EXISTS (SELECT 1 FROM norm r JOIN shared_docs b2 ON b2.from_ecli=r.from_ecli
                   WHERE r.cite_kind='rdf' AND r.from_ecli=t.from_ecli
                     AND r.law=t.law AND r.article=t.article)
LIMIT 8;
