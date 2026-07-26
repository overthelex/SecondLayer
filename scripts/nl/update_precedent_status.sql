-- LEXAI-1885, pass 4: precedent status from the outcomes the publisher states.
--
-- Only appeal-type relations count. `gevolgd` on a conclusion_for edge means the
-- Hoge Raad followed the Advocate-General, which says nothing about whether the
-- decision below is still good law, so those edges are excluded here.
SET max_parallel_workers_per_gather = 6;
\timing on

WITH appeal AS (
    SELECT parent_ecli,
           array_agg(DISTINCT child_ecli) FILTER (WHERE outcome ILIKE '%vernietig%') AS quashed_by,
           bool_or(outcome ILIKE '%vernietig%')                AS was_quashed,
           bool_or(outcome ILIKE '%bekrachtiging%'
                OR outcome ILIKE '%bevestiging%')              AS was_upheld
    FROM nl_instance_links
    WHERE relation IN ('appeal_of', 'cassation_of', 'sprongcassatie')
      AND outcome IS NOT NULL
    GROUP BY parent_ecli
)
INSERT INTO nl_precedent_status (ecli, status, overruled_by, cited_by_count, last_computed)
SELECT a.parent_ecli,
       -- quashed wins over upheld: a decision quashed in part is not clean
       -- authority even if another appeal affirmed something else in it
       CASE WHEN a.was_quashed THEN 'quashed'
            WHEN a.was_upheld  THEN 'upheld'
            ELSE NULL END,
       a.quashed_by,
       0,
       now()
FROM appeal a
ON CONFLICT (ecli) DO UPDATE
   SET status        = EXCLUDED.status,
       overruled_by  = EXCLUDED.overruled_by,
       last_computed = EXCLUDED.last_computed;

-- keep the citation counts, which the previous pass computed over all resolved edges
UPDATE nl_precedent_status p
SET cited_by_count = c.n
FROM (SELECT to_ecli, count(*) AS n FROM nl_case_citations
      WHERE resolved AND to_ecli IS NOT NULL GROUP BY to_ecli) c
WHERE p.ecli = c.to_ecli AND p.cited_by_count <> c.n;

\echo == status distribution ==
SELECT coalesce(status, '(unknown, no appeal on record)') AS status,
       count(*) AS decisions,
       round(avg(cited_by_count), 1) AS avg_citations
FROM nl_precedent_status GROUP BY 1 ORDER BY 2 DESC;

\echo == a quashed decision with its quasher ==
SELECT p.ecli, p.status, p.overruled_by[1] AS quashed_by, p.cited_by_count, d.court_name
FROM nl_precedent_status p JOIN nl_rechtspraak_decisions d USING (ecli)
WHERE p.status = 'quashed' AND p.cited_by_count > 0
ORDER BY p.cited_by_count DESC LIMIT 5;
