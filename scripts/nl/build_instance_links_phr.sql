-- LEXAI-1885, pass 1: pair each Advocate-General conclusion with the Hoge Raad
-- decision it belongs to.
--
-- In the Netherlands the AG's conclusion is published as its own document
-- (ECLI:NL:PHR:...) rather than as an opinion inside the judgment, and it shares
-- the case number with the Hoge Raad decision (ECLI:NL:HR:...). There are 58,863
-- PHR documents and 100,279 HR ones, so this pairing is the cheapest real edge
-- in the whole graph, and it is also what stands in for the `dissent` role that
-- the shared taxonomy expects and Dutch law does not produce.
--
-- The ladder proper (rechtbank → hof → Hoge Raad) needs the in-text citations,
-- so it comes after LEXAI-1884.
SET max_parallel_workers_per_gather = 6;
\timing on

DELETE FROM nl_instance_links WHERE method = 'phr_pair';

INSERT INTO nl_instance_links (child_ecli, parent_ecli, relation, method, confidence)
SELECT DISTINCT phr.ecli, hr.ecli, 'conclusion_for', 'phr_pair',
       -- a case number shared by exactly one PHR and one HR document is a
       -- certain pair; where several share it the link is still right in kind
       -- but the exact partner is a guess, so it is scored lower
       CASE WHEN cnt.hr_per_number = 1 THEN 1.0 ELSE 0.6 END
FROM nl_case_aliases pa
JOIN nl_case_aliases ha
  ON ha.alias_kind = 'zaaknummer' AND ha.alias_norm = pa.alias_norm
JOIN nl_rechtspraak_decisions phr ON phr.ecli = pa.ecli
JOIN nl_rechtspraak_decisions hr  ON hr.ecli  = ha.ecli
JOIN LATERAL (
    SELECT count(*) AS hr_per_number
    FROM nl_case_aliases x
    WHERE x.alias_kind = 'zaaknummer' AND x.alias_norm = pa.alias_norm
      AND x.ecli LIKE 'ECLI:NL:HR:%'
) cnt ON true
WHERE pa.alias_kind = 'zaaknummer'
  AND pa.ecli LIKE 'ECLI:NL:PHR:%'
  AND ha.ecli LIKE 'ECLI:NL:HR:%'
ON CONFLICT DO NOTHING;

\echo == result ==
SELECT relation, method, count(*) AS links,
       count(DISTINCT child_ecli) AS conclusions_linked,
       round(avg(confidence)::numeric, 2) AS avg_confidence
FROM nl_instance_links GROUP BY 1, 2;

\echo == coverage: how many PHR documents got a partner ==
SELECT count(*) AS phr_total,
       count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM nl_instance_links l WHERE l.child_ecli = d.ecli)) AS phr_paired
FROM nl_rechtspraak_decisions d WHERE d.ecli LIKE 'ECLI:NL:PHR:%';
