-- repair-lcl-by-number.sql
--
-- legislation_citation_links has no resolution leg for citations that name a
-- law by NUMBER. build-legislation-citation-links.sql binds only through
-- `lawmap` (6 abbreviations), `name_alias` (113 titles) and an exact or
-- normalised match on legislation.title, so every «Закон України … № 2262-
-- від 09.04.1992» row was structurally unresolvable. That is the
-- law_not_in_registry class, ~4% of 331M rows.
--
-- This binds what can be bound, through npa.act_number (migration 187).
--
-- WHAT THIS DOES NOT FIX, measured, so the number below is not read as
-- "citations are now resolved" (TABLESAMPLE 0.05%, 6 116 rows of the class):
--
--     456 bind to exactly one act              -> ~912 000 rows
--     272 of those acts exist in legislation   -> ~544 000 rows  <- the yield
--      98 distinct acts bind, of which only 30 are in legislation
--
--   * The cap is STRUCTURAL, not a numbering problem.
--     legislation_citation_links.legislation_id references public.legislation,
--     which holds 651 curated acts; the corpus holds 293 049. Citations to the
--     other ~292 000 acts have no id to point at and stay unresolved however
--     well their number parses. Lifting that needs an nreg column on this
--     table, i.e. a schema change on 87 GB, not this script.
--
--   * Ambiguous rows are left alone. 1 864 of the sampled 6 116 parse to a
--     bare core with no date, and of 5 745 law-shaped cores only 855 are
--     unique while 1 016 recur across six convocations. Their Roman suffix was
--     destroyed at extraction -- extract-citations.py:100 has a greedy
--     [\d\-]{1,20} that eats the separating hyphen, so «2262-XII» arrived as
--     «2262-». Recovering those needs re-extraction against the decision text.
--     Guessing between six convocations would attribute law to the wrong act.
--
-- Run detached rather than in a foreground heredoc: a killed client leaves
-- psql running inside the container, holding locks.
--   ssh prod "docker exec -i secondlayer-postgres-prod \
--     psql -U secondlayer -d secondlayer_prod -v ON_ERROR_STOP=1" \
--     < scripts/citation-graph/repair-lcl-by-number.sql

\set ON_ERROR_STOP on
SET statement_timeout = '7200s';

-- ---------------------------------------------------------------------------
-- 0. A date conversion that cannot abort the run.
--
-- to_date() does not just reject impossible field values, it VALIDATES the day
-- against the month, so it throws on «19.19.2010» (month 19) and equally on
-- «29.02.1991» (a real-looking date in a non-leap year). Both are in the
-- corpus, and each one aborted a ~14-minute pass over 12M rows before this
-- existed. No regex covers the calendar; only an exception handler does.
-- A date that cannot be parsed reads as absent, and the row then needs a
-- globally unique core to bind at all.
CREATE OR REPLACE FUNCTION public.try_to_date(t text, fmt text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  RETURN to_date(t, fmt);
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Materialise the candidates in ONE pass over the unresolved class.
--    Re-deriving them per batch would re-scan ~12M rows every time.
DROP TABLE IF EXISTS public.lcl_number_repair;
CREATE TABLE public.lcl_number_repair AS
WITH parsed AS (
  SELECT l.id, l.law_article_raw,
         (regexp_match(l.law_number_raw,
            '^\s*№?\s*([0-9]{1,5})-?\s*(?:від\s+[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})?\s*$'))[1] AS core,
         -- Parsed ONCE here rather than inside the correlated subquery below,
         -- and through try_to_date so an impossible calendar date cannot abort
         -- a 12M-row pass. See the function comment above.
         public.try_to_date(
           (regexp_match(l.law_number_raw, 'від\s+([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})'))[1],
           'DD.MM.YYYY') AS dt
  FROM public.legislation_citation_links l
  WHERE NOT l.resolved AND l.unresolved_reason = 'law_not_in_registry'
), hit AS (
  -- Exactly one act, or nothing. The date pins the convocation; without it the
  -- core has to be globally unique among law-shaped acts.
  SELECT p.id, p.law_article_raw,
         (SELECT array_agg(DISTINCT an.nreg)
            FROM npa.act_number an
            JOIN npa.act a ON a.nreg = an.nreg
           WHERE an.alias_norm = p.core
             AND an.kind = 'core_only'
             AND (p.dt IS NULL OR a.first_ed = p.dt)) AS nregs
  FROM parsed p
  WHERE p.core IS NOT NULL
)
SELECT h.id, h.nregs[1] AS nreg, h.law_article_raw
FROM hit h
WHERE array_length(h.nregs, 1) = 1;

CREATE UNIQUE INDEX ON public.lcl_number_repair (id);
ANALYZE public.lcl_number_repair;

-- ---------------------------------------------------------------------------
-- 2. Attach the target legislation row and, where possible, the article.
--    resolved mirrors the builder exactly: resolved = (article_id IS NOT NULL).
--    Binding the law alone is NOT resolution -- the citation names an article.
DROP TABLE IF EXISTS public.lcl_number_repair_bound;
CREATE TABLE public.lcl_number_repair_bound AS
WITH byart AS (
  SELECT DISTINCT ON (legislation_id, article_number)
         legislation_id, article_number, id AS article_id
  FROM public.legislation_articles
  WHERE is_current
  ORDER BY legislation_id, article_number, version_date DESC
)
SELECT r.id,
       pl.id  AS legislation_id,
       ba.article_id,
       ba.article_number
FROM public.lcl_number_repair r
JOIN public.legislation pl ON lower(pl.rada_id) = r.nreg
LEFT JOIN byart ba
       ON ba.legislation_id = pl.id
      AND ba.article_number = btrim(regexp_replace(coalesce(r.law_article_raw, ''), '^(ст|стаття|п|пункт)\.?\s*', '', 'i'));

CREATE UNIQUE INDEX ON public.lcl_number_repair_bound (id);
ANALYZE public.lcl_number_repair_bound;

\echo ''
\echo '=== yield, and what stays out of scope ==='
SELECT
  (SELECT count(*) FROM public.legislation_citation_links
     WHERE NOT resolved AND unresolved_reason = 'law_not_in_registry') AS class_total,
  (SELECT count(*) FROM public.lcl_number_repair)                      AS binds_one_act,
  (SELECT count(*) FROM public.lcl_number_repair_bound)                AS act_in_legislation,
  (SELECT count(*) FROM public.lcl_number_repair_bound
     WHERE article_id IS NOT NULL)                                     AS article_also_binds,
  (SELECT count(DISTINCT legislation_id) FROM public.lcl_number_repair_bound) AS distinct_acts;

-- ---------------------------------------------------------------------------
-- 3. Apply, batched by id so no single statement rewrites a million rows of an
--    87 GB table.
DO $repair$
DECLARE
  lo bigint;
  hi bigint;
  step bigint := 2000000;
  n bigint;
  total bigint := 0;
BEGIN
  SELECT min(id), max(id) INTO lo, hi FROM public.lcl_number_repair_bound;
  IF lo IS NULL THEN
    RAISE NOTICE 'nothing to repair';
    RETURN;
  END IF;

  WHILE lo <= hi LOOP
    UPDATE public.legislation_citation_links l
       SET legislation_id    = b.legislation_id,
           article_id        = b.article_id,
           article_number    = COALESCE(b.article_number, l.article_number),
           match_method      = 'number',
           resolved          = (b.article_id IS NOT NULL),
           unresolved_reason = CASE WHEN b.article_id IS NOT NULL
                                    THEN NULL ELSE 'article_not_found' END
      FROM public.lcl_number_repair_bound b
     WHERE l.id = b.id
       AND l.id >= lo AND l.id < lo + step
       -- re-check the precondition: never re-touch a row another pass resolved
       AND NOT l.resolved
       AND l.unresolved_reason = 'law_not_in_registry';
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    lo := lo + step;
  END LOOP;

  RAISE NOTICE 'repaired % rows', total;
END
$repair$;

-- ---------------------------------------------------------------------------
-- 4. After.
\echo ''
\echo '=== after ==='
SELECT match_method, count(*) AS n, count(*) FILTER (WHERE resolved) AS res
FROM public.legislation_citation_links
WHERE match_method = 'number' GROUP BY 1;

SELECT unresolved_reason, count(*)
FROM public.legislation_citation_links
WHERE NOT resolved GROUP BY 1 ORDER BY 2 DESC;
