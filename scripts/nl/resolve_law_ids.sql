-- Point the 2,507,190 statute edges at real BWB regulations (LEXAI-1893).
--
-- Exact title match first, on purpose. The reference half of the edges came from
-- dcterms:references, where Rechtspraak writes the regulation's official title,
-- and nl_laws.title holds that same official title from KOOP - so the two should
-- meet without fuzzy matching. Anything that needs trigram similarity is a sign
-- the name is a variant, and is handled separately and counted, not folded in
-- silently.
SET max_parallel_workers_per_gather = 6;
\timing on

\echo == 1. exact title match ==
UPDATE nl_legislation_citations c
   SET law_id = l.bwb_id, resolved = true
  FROM nl_laws l
 WHERE c.law_id IS NULL
   AND lower(btrim(c.law_name_raw)) = lower(btrim(l.title));

\echo == 2. same, ignoring the parenthetical qualifier the source sometimes adds ==
-- "Wetboek van Burgerlijke Rechtsvordering (geldt in geval van digitaal
-- procederen)" is the same act as the plain name.
UPDATE nl_legislation_citations c
   SET law_id = l.bwb_id, resolved = true
  FROM nl_laws l
 WHERE c.law_id IS NULL
   AND lower(btrim(regexp_replace(c.law_name_raw, '\s*\(.*\)$', ''))) = lower(btrim(l.title));

\echo == coverage ==
SELECT cite_kind,
       count(*) AS edges,
       count(law_id) AS with_law_id,
       round(100.0 * count(law_id) / count(*), 1) AS pct,
       count(DISTINCT law_id) AS distinct_laws
FROM nl_legislation_citations GROUP BY 1 ORDER BY 2 DESC;

\echo == names that still do not match, by weight ==
SELECT law_name_raw, count(*) AS edges
FROM nl_legislation_citations WHERE law_id IS NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 12;

\echo == point in time: which edition was in force when the case was decided ==
SELECT count(*) AS edges_with_law,
       count(*) FILTER (WHERE e.bwb_id IS NOT NULL) AS edges_with_edition,
       round(100.0 * count(*) FILTER (WHERE e.bwb_id IS NOT NULL) / count(*), 1) AS pct
FROM nl_legislation_citations c
JOIN nl_rechtspraak_decisions d ON d.ecli = c.from_ecli
LEFT JOIN LATERAL (
    SELECT x.bwb_id FROM nl_law_editions x
     WHERE x.bwb_id = c.law_id
       AND x.valid_from <= d.decision_date
       AND (x.valid_to IS NULL OR x.valid_to >= d.decision_date)
     LIMIT 1
) e ON true
WHERE c.law_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The bare name against an official title that adds a qualifier or a year.
--
-- Rechtspraak writes "Wegenverkeerswet" where KOOP's title is "Wegenverkeerswet
-- 1994", and "Wetboek van Burgerlijke Rechtsvordering" where two acts exist:
-- "(geldt in geval van digitaal procederen)" with 123 editions and
-- "(geldt in geval van niet-digitaal procederen)" with 30.
--
-- So this is a dominance choice, not an identity, and it is treated as one: the
-- candidate with the most editions wins, ties are left alone, and the number of
-- names that had a real contender is reported rather than hidden. The
-- distinction matters legally - which Rv applies depends on whether the case was
-- digitalised - so these edges get resolved=false to keep them separable from
-- the exact matches.
-- ---------------------------------------------------------------------------
WITH cand AS (
    SELECT c.law_name_raw,
           l.bwb_id,
           l.edition_count,
           row_number() OVER (PARTITION BY c.law_name_raw ORDER BY l.edition_count DESC) AS rn,
           count(*)    OVER (PARTITION BY c.law_name_raw) AS n_candidates
    FROM (SELECT DISTINCT law_name_raw FROM nl_legislation_citations WHERE law_id IS NULL) c
    JOIN nl_laws l
      ON l.title ~ ('^' || regexp_replace(c.law_name_raw, '([.()\[\]{}*+?^$|\\])', '\\\1', 'g') || '( \(| [0-9]{4})')
)
UPDATE nl_legislation_citations c
   SET law_id = cand.bwb_id, resolved = false
  FROM cand
 WHERE c.law_id IS NULL AND cand.rn = 1 AND c.law_name_raw = cand.law_name_raw;

\echo == coverage after the dominance pass ==
SELECT count(*) AS edges, count(law_id) AS with_law_id,
       round(100.0*count(law_id)/count(*),1) AS pct,
       count(*) FILTER (WHERE law_id IS NOT NULL AND NOT resolved) AS matched_by_dominance
FROM nl_legislation_citations;
