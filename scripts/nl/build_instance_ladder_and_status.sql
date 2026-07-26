-- LEXAI-1885, pass 2: the instance ladder, then precedent status.
--
-- "A cites B" alone does not mean "A is the appeal of B": a judgment cites
-- plenty of unrelated precedent. The ladder link is the intersection of three
-- signals, which is cheap now that both edge tables exist:
--   1. A cites B (resolved edge)
--   2. A and B share a case number (alias dictionary)
--   3. A sits higher in the court hierarchy than B
-- All three together is a strong signal; any one of them alone is not.
SET max_parallel_workers_per_gather = 6;
\timing on

DELETE FROM nl_instance_links WHERE method = 'zaaknummer';

WITH level AS (
    SELECT ecli,
           substring(ecli from '^ECLI:NL:([A-Z]+):') AS court,
           CASE
             WHEN substring(ecli from '^ECLI:NL:([A-Z]+):') IN ('HR','PHR','RVS','CRVB','CBB','TC') THEN 3
             WHEN substring(ecli from '^ECLI:NL:([A-Z]+):') LIKE 'GH%' THEN 2
             WHEN substring(ecli from '^ECLI:NL:([A-Z]+):') LIKE 'RB%' THEN 1
             ELSE 0
           END AS lvl
    FROM nl_rechtspraak_decisions
)
INSERT INTO nl_instance_links (child_ecli, parent_ecli, relation, method, confidence)
SELECT DISTINCT
       c.from_ecli,
       c.to_ecli,
       CASE WHEN la.lvl = 3 THEN 'cassation_of' ELSE 'appeal_of' END,
       'zaaknummer',
       0.85
FROM nl_case_citations c
JOIN level la ON la.ecli = c.from_ecli
JOIN level lb ON lb.ecli = c.to_ecli
WHERE c.resolved
  AND la.lvl > lb.lvl AND lb.lvl > 0
  AND EXISTS (
        SELECT 1
        FROM nl_case_aliases aa
        JOIN nl_case_aliases ab
          ON ab.alias_kind = 'zaaknummer' AND ab.alias_norm = aa.alias_norm
        WHERE aa.alias_kind = 'zaaknummer'
          AND aa.ecli = c.from_ecli AND ab.ecli = c.to_ecli)
ON CONFLICT DO NOTHING;

\echo == instance links by relation ==
SELECT relation, method, count(*) FROM nl_instance_links GROUP BY 1, 2 ORDER BY 3 DESC;

-- ---------------------------------------------------------------------------
-- Precedent status. Only the citation count is computed here: deciding that a
-- decision was actually overruled needs the `treatment` classification, which a
-- model fills in later. Writing a status we cannot yet justify would be exactly
-- the "green badge over nothing" we criticise elsewhere, so status stays NULL
-- until treatment exists.
-- ---------------------------------------------------------------------------
INSERT INTO nl_precedent_status (ecli, status, cited_by_count, last_computed)
SELECT c.to_ecli, NULL, count(*), now()
FROM nl_case_citations c
WHERE c.resolved AND c.to_ecli IS NOT NULL
GROUP BY c.to_ecli
ON CONFLICT (ecli) DO UPDATE
   SET cited_by_count = EXCLUDED.cited_by_count,
       last_computed  = EXCLUDED.last_computed;

\echo == precedent status ==
SELECT count(*) AS decisions_cited_at_least_once,
       max(cited_by_count) AS most_cited,
       round(avg(cited_by_count), 2) AS avg_citations
FROM nl_precedent_status;

\echo == most cited decisions ==
SELECT p.ecli, p.cited_by_count, d.court_name, d.decision_date
FROM nl_precedent_status p JOIN nl_rechtspraak_decisions d USING (ecli)
ORDER BY p.cited_by_count DESC LIMIT 10;
