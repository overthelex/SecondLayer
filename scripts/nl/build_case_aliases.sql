-- LEXAI-1882: the alias dictionary that lets old-style citations resolve.
--
-- Reality check before writing this: metadata_json->'hasVersion' is NOT a clean
-- list of journal citations. It is one free-text string that always starts with
-- "Rechtspraak.nl" and sometimes has publications appended:
--   "Rechtspraak.nl SR-Updates.nl 2020-0260 ... NJB 2020/1907 RvdW 2020/888 NJ 2020/410 ..."
-- Of 1,020,999 rows carrying the field, 648,360 are only "Rechtspraak.nl" and
-- 158,143 match a journal pattern. So this yields aliases for ~158k decisions,
-- several each, not the million the field count suggests.
SET max_parallel_workers_per_gather = 6;
\timing on

DELETE FROM nl_case_aliases WHERE source IN ('hasVersion', 'case_number');

-- ---------------------------------------------------------------------------
-- Journal citations. Alternatives are ordered longest-first on purpose:
-- Postgres alternation takes the first branch that matches at a position, so
-- "ABkort" has to be tried before "AB" or every ABkort cite becomes an AB cite.
-- ---------------------------------------------------------------------------
INSERT INTO nl_case_aliases (alias_kind, alias_norm, ecli, source)
SELECT DISTINCT
       'journal',
       upper(m[1]) || ' ' || m[2] || '/' || m[3],
       d.ecli,
       'hasVersion'
FROM nl_rechtspraak_decisions d
CROSS JOIN LATERAL regexp_matches(
        d.metadata_json->>'hasVersion',
        '(ABkort|AR-Updates\.nl|SR-Updates\.nl|ERF-Updates\.nl|JONDR|RvdW|BNB|USZ|JAR|NJB|JOR|JOW|JOM|JHV|JWR|JIN|RAV|NTS|V-N|FED|NJ|AB|JB|PJ|RV|RO|JG)\s?(\d{4})[/-](\d+)',
        'g') AS m
WHERE d.metadata_json ? 'hasVersion'
  AND d.metadata_json->>'hasVersion' <> 'Rechtspraak.nl'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Case numbers. Needed to pair an AG conclusion with its Hoge Raad decision and
-- to walk the instance ladder. A case_number can hold several numbers separated
-- by " / " ("C/10/718537 / KG ZA 26-384"), so each part is registered too.
-- ---------------------------------------------------------------------------
INSERT INTO nl_case_aliases (alias_kind, alias_norm, ecli, source)
SELECT DISTINCT 'zaaknummer',
       upper(regexp_replace(part, '\s+', '', 'g')),
       d.ecli,
       'case_number'
FROM nl_rechtspraak_decisions d
CROSS JOIN LATERAL unnest(string_to_array(d.case_number, ' / ')) AS part
WHERE d.case_number IS NOT NULL
  AND length(btrim(part)) BETWEEN 4 AND 60
ON CONFLICT DO NOTHING;

\echo == result ==
SELECT alias_kind, source, count(*) AS aliases, count(DISTINCT ecli) AS decisions
FROM nl_case_aliases GROUP BY 1, 2 ORDER BY 1, 2;

\echo == collisions: one alias pointing at several decisions ==
SELECT alias_kind, count(*) AS ambiguous_aliases
FROM (SELECT alias_kind, alias_norm FROM nl_case_aliases
      GROUP BY 1, 2 HAVING count(DISTINCT ecli) > 1) x
GROUP BY 1;

\echo == sample journal aliases ==
SELECT alias_norm, ecli FROM nl_case_aliases WHERE alias_kind = 'journal' LIMIT 8;

-- ---------------------------------------------------------------------------
-- LJN codes. No separate source is needed: when Rechtspraak assigned ECLIs to
-- pre-2013 decisions it reused the LJN as the ordinal, so ECLI:NL:PHR:2008:BB4767
-- *is* LJN BB4767. Anything whose ordinal looks like an LJN gets registered.
-- ---------------------------------------------------------------------------
INSERT INTO nl_case_aliases (alias_kind, alias_norm, ecli, source)
SELECT DISTINCT 'ljn', substring(ecli from ':([A-Z]{2}[0-9]{4})$'), ecli, 'ecli_suffix'
FROM nl_rechtspraak_decisions
WHERE ecli ~ ':[A-Z]{2}[0-9]{4}$'
ON CONFLICT DO NOTHING;

\echo == ljn aliases ==
SELECT count(*) AS ljn_aliases FROM nl_case_aliases WHERE alias_kind = 'ljn';
