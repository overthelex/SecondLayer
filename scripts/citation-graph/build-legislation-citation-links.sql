-- ⚠ THIS SCRIPT REBUILDS THE 87 GB CITATION GRAPH. Read the safety notes.
--
-- It used to DROP the live table and then run a ~57-minute INSERT with
-- statement_timeout='1800s' and NO ON_ERROR_STOP. Measured: the unpatched
-- SELECT alone scales to ~3 400 s, i.e. it was ALREADY past the timeout. When
-- the INSERT died, psql did not stop — it went on to CREATE INDEX four times
-- on an empty table and print a COVERAGE report of zero. A routine rerun could
-- therefore destroy 331 M rows and report success.
--
-- Now: fail fast, build beside the live table, and swap only once the new one
-- is complete. A failure at any point leaves the serving table untouched.
\set ON_ERROR_STOP on
SET statement_timeout='4h';

-- Only one rebuild at a time. This script drops and replaces the serving
-- table, so two overlapping runs would each validate their own staging table
-- and then race to drop whatever is live at that moment. A SESSION-level
-- advisory lock spans the whole script and is released when psql disconnects,
-- including on a crash. try_ rather than plain lock: waiting hours behind
-- another rebuild is not useful, and failing loudly says what happened.
DO $lock$
BEGIN
  IF NOT pg_try_advisory_lock(hashtext('build-legislation-citation-links')) THEN
    RAISE EXCEPTION
      'another rebuild already holds the advisory lock; refusing to run concurrently';
  END IF;
END
$lock$;

-- Best-effort only, and deliberately so. A session advisory lock does not
-- survive a transaction-pooled connection, so it cannot be what makes the
-- swap safe — that job belongs to the ACCESS EXCLUSIVE lock inside the swap
-- transaction at the end of this file. All this buys is stopping a second run
-- from burning 90 minutes before discovering it was redundant.
-- Run DIRECTLY against Postgres (port 5432), never through pgbouncer.

-- to_date does not merely reject impossible field values, it VALIDATES the day
-- against the month, so it THROWS on «19.19.2010» AND on «29.02.1991». Both are
-- in the corpus, and each one aborted a 14-minute pass while the repair was
-- being written. No regex covers the calendar; only an exception handler does.
-- Defined here so the builder does not depend on repair-lcl-by-number.sql
-- having been run against this database first.
CREATE OR REPLACE FUNCTION public.try_to_date(t text, fmt text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  RETURN to_date(t, fmt);
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$fn$;

DROP TABLE IF EXISTS public.legislation_citation_links_new;
CREATE TABLE public.legislation_citation_links_new (
  id bigserial PRIMARY KEY, doc_id bigint NOT NULL, legislation_id integer, article_id integer,
  article_number varchar, law_number_raw text NOT NULL, law_article_raw text, citation_type text,
  citation_context text, match_method text NOT NULL, resolved boolean NOT NULL DEFAULT false,
  unresolved_reason text, src_citation_id bigint, created_at timestamptz DEFAULT now());
INSERT INTO public.legislation_citation_links_new
  (doc_id, legislation_id, article_id, article_number, law_number_raw, law_article_raw,
   citation_type, citation_context, match_method, resolved, unresolved_reason, src_citation_id)
WITH
name_alias(name, legislation_id) AS (VALUES
  ('Про приватизацію державного житлового фонду', 24),
  ('Про загальнообов''язкове державне соціальне страхування від нещасних випадків на виробництві та професійних захворювань', 76),
  ('Про загальнообов''язкове державне соціальне страхування від нещасного випадку на виробництві...', 76),
  ('Про державну реєстрацію юридичних осіб  та фізичних осіб – підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та  фізичних осіб - підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб - під-приємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб - підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб -підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб – підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб –підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб —підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб-підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб–підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та фізичних осіб—підприємців', 631),
  ('Про державну реєстрацію юридичних осіб та  фізичних осіб - підприємців', 631),
  ('Про державну реєстрацію юридичних осіб і фізичних осіб - підприємців', 631),
  ('Про державну реєстрацію юридичних осіб і фізичних осіб-підприємців', 631),
  ('Про державну реєстрацію юридичних та фізичних осіб - підприємців', 631),
  ('Про державну реєстрацію юридичних чи фізичних осіб- підприємців', 631),
  ('Про державну реєстрацію юридичних і фізичних осіб - підприємців', 631),
  ('Про основи соціальної захищеності інвалідів', 671),
  ('Про основи соціальної захищеності інвалідів Україні', 671),
  ('Про основи соціальної захищеності інвалідів в Україні', 671),
  ('Про загальнообов''язкове державне пенсійне страхування.', 693),
  ('Про загальнообов''язкове  державне пенсійне страхування', 693),
  ('Про загальнообовязкове державне пенсійне страхування', 693),
  ('Про загальнообов‘язкове державне пенсійне страхування', 693),
  ('Про загальнообов’язкове  державне пенсійне страхування', 693),
  ('Про загальнообов’язкове державне пенсійне страхування', 693),
  ('Житловий кодекс України', 756),
  ('Про  відновлення платоспроможності боржника або визнання його банкрутом', 757),
  ('Про банкрутство', 757),
  ('Про відновлення   2 платоспроможності боржника або визнання його банкрутом''', 757),
  ('Про відновлення платоспроможності  боржника   або визнання   його банкрутом', 757),
  ('Про відновлення платоспроможності  боржника або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності божника або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності боржника  або  визнання його  банкрутом', 757),
  ('Про відновлення платоспроможності боржника  або визнання його  банкрутом', 757),
  ('Про відновлення платоспроможності боржника  або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності боржника або визнання  його  банкрутом', 757),
  ('Про відновлення платоспроможності боржника або визнання  його банкрутом', 757),
  ('Про відновлення платоспроможності боржника або визнання боржника банкрутом', 757),
  ('Про відновлення платоспроможності боржника або визнання його  банкрутом', 757),
  ('Про відновлення платоспроможності боржника або визнання йото банкрутом', 757),
  ('Про відновлення платоспроможності боржника або визнаня його банкрутом', 757),
  ('Про відновлення платоспроможності боржника або про визнання його банкрутом', 757),
  ('Про відновлення платоспроможності боржника та визнання його банкрутом', 757),
  ('Про відновлення платоспроможності боржника, або визнання його  банкрутом', 757),
  ('Про відновлення платоспроможності боржника, або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності боржника  або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності боржника  або визнання  його банкрутом', 757),
  ('Про відновлення платоспроможності боржникаабо визнання його банкрутом', 757),
  ('Про відновлення платоспроможності  боржника  або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності   боржника або визнання його банкрутом', 757),
  ('Про відновлення платоспроможності               боржника або визнання його банкрутом', 757),
  ('Про  відновлення платоспроможності боржника або визнання його банкрутом', 757),
  ('Про систему оподатковування', 758),
  ('Про Державну податкову службу в Україні', 762),
  ('Про державну податкову службу', 762),
  ('Про державну податкову службу України', 762),
  ('Про державну податкову службу в України', 762),
  ('Про порядок погашення зобов', 763),
  ('Про порядок погашення зобов''язань  платників податків перед бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань  платників податків перед бюджетами і державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платниками податків перед бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників  податків  перед  бюджетами  та   державними   цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників перед  бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами и державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами та державним цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами та державними цільовими, фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами та держаними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами та цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами і державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетами, та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетними та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетом та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків перед бюджетом та цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків  перед бюджетами й державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань платників податків  перед бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань  платників податків перед бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов''язань  платників податків перед бюджетами і державними цільовими фондами', 763),
  ('Про порядок погашення зобов’язань  платників податків  перед бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов’язань платників податків перед бюджетами та державними  цільовими фондами', 763),
  ('Про порядок погашення зобов’язань платників податків перед бюджетами та державними цільовими фондами', 763),
  ('Про порядок погашення зобов’язань платників податків перед бюджетами та цільовими фондами', 763),
  ('Про порядок погашення зобов’язань платників податків перед бюджетом та державними цільовими фондами', 763),
  ('Про ПДВ', 765),
  ('Про податок на додану вартість № НОМЕР_23р. із змінами та доповненнями), Порядку заповнення податкової накладної ВАТ', 765),
  ('Про оподаткування прибутку підприємства', 766),
  ('Про місцеве самоврядування', 767),
  ('Про місцеве самоврядування в України', 767),
  ('Про місцеве самоврядування вУкраїні', 767),
  ('Про застосування РРО в свері торгівлі громадського харчування та послуг', 769),
  ('Про застосування РРО в сфері торгівлі, громадського харчування та послуг', 769),
  ('Про застосування РРО у сфері торгівлі,', 769),
  ('Про застосування РРО у сфері торгівлі, громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових   операцій у сфері торгівлі, громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій в сфері торгівлі, громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій у сфері торгівлі громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій у сфері торгівлі, громадського харчування й послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій у сфері торгівлі, суспільного харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій у сфері торгівлі,    громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій у сфері торгівлі,громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операцій і сфері торгівлі, громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових операції у сфері торгівлі, громадського харчування та послуг', 769),
  ('Про застосування реєстраторів розрахункових         операцій у сфері торгівлі, громадського харчування та послуг', 769),
  ('Про житлово - комунальні послуги', 772),
  ('Про житлово-комунальні послуги від 24.06.2004 p., п.23', 772),
  ('Про автомобільний транспорт.', 773)
),
lawmap AS (
  SELECT 'КУПАП'::text v, 653 legislation_id, 'alias'::text method
  UNION ALL SELECT 'КУПАП',22,'alias'
  UNION ALL SELECT 'КУпАП',653,'alias'
  UNION ALL SELECT 'КУпАП',22,'alias'
  UNION ALL SELECT 'КЗПП',643,'alias'
  UNION ALL SELECT 'КЗпП',643,'alias'
  UNION ALL SELECT name, legislation_id, 'name_alias' FROM name_alias),
la_cur AS (SELECT legislation_id, count(*) c FROM legislation_articles WHERE is_current GROUP BY 1),
la_any AS (SELECT legislation_id, count(*) a FROM legislation_articles GROUP BY 1),
canon AS (
  SELECT DISTINCT ON (l.title) l.title, l.id AS legislation_id
  FROM legislation l LEFT JOIN la_cur cu ON cu.legislation_id=l.id LEFT JOIN la_any an ON an.legislation_id=l.id
  ORDER BY l.title, COALESCE(cu.c,0) DESC, COALESCE(an.a,0) DESC, l.id),
best_art AS (
  SELECT DISTINCT ON (legislation_id, article_number) legislation_id, article_number, id AS article_id
  FROM legislation_articles ORDER BY legislation_id, article_number, is_current DESC, version_date DESC NULLS LAST),
-- ---------------------------------------------------------------------------
-- The NUMBER leg. Native port of scripts/citation-graph/repair-lcl-by-number.sql
-- (PR #2275), which bound 604 379 citations that name a law only by number.
-- Without it every rebuild silently destroys all of them.
--
-- Resolved per DISTINCT value, then hash-joined back. law_number is a small
-- vocabulary — a 0.05% sample holds 163 861 rows but only 1 362 distinct values
-- — so the expensive part runs once per distinct string, not once per row.
--
-- It deliberately does NOT reference best_art. Doing so would make best_art a
-- twice-referenced CTE, which PG 15 then materialises instead of inlining,
-- flipping the largest join from Hash Left Join to Merge Right Join: measured
-- 1.56x slower with double the temp spill. Article binding is left to the
-- existing withart join, which already covers rows the number leg supplies.
numparse AS (
  SELECT DISTINCT
         btrim(regexp_replace(law_number,'\s+',' ','g')) AS v,
         (regexp_match(law_number,
            '^\s*№?\s*([0-9]{1,5})-?\s*(?:від\s+[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})?\s*$'))[1] AS core,
         public.try_to_date(
           (regexp_match(law_number, 'від\s+([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})'))[1],
           'DD.MM.YYYY') AS dt
  FROM public.law_court_citations
  WHERE law_number ~ '^\s*№?\s*[0-9]{1,5}-?\s*(?:від\s+[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})?\s*$'),
numcand AS (
  -- Ambiguity is judged over the WHOLE corpus, before anything narrows it.
  -- Joining public.legislation here instead would filter the rival candidates
  -- away BEFORE the count, so a number naming three acts of which only one
  -- happens to be curated would look unambiguous and bind — silently
  -- attributing law to whichever act we happen to hold. That is precisely the
  -- guess this leg exists to refuse.
  SELECT p.v, array_agg(DISTINCT an.nreg) AS nregs
  FROM numparse p
  JOIN npa.act_number an ON an.alias_norm = npa.norm_number(p.core) AND an.kind = 'core_only'
  JOIN npa.act a         ON a.nreg = an.nreg AND (p.dt IS NULL OR a.first_ed = p.dt)
  WHERE p.core IS NOT NULL
  GROUP BY p.v),
numbermap AS (
  -- Exactly one act corpus-wide, and it has to be one we can point at.
  -- legislation_id references public.legislation (651 curated acts), so a
  -- citation naming any of the other ~292 000 stays unresolved however well
  -- its number parses. That cap is structural, and it is applied AFTER the
  -- ambiguity test, never as part of it.
  SELECT c.v, pl.id AS legislation_id
  FROM numcand c
  JOIN public.legislation pl ON lower(pl.rada_id) = c.nregs[1]
  WHERE array_length(c.nregs, 1) = 1),
matched AS (
  SELECT lcc.id cid, lcc.court_case_id doc_id, lcc.law_number, lcc.law_article, lcc.citation_type,
         lcc.citation_context, nrm.v,
         -- Number comes LAST: it can only fill a row the title and alias legs
         -- left NULL. Measured on prod: of 160 708 already-bound rows, ZERO
         -- carry a number-shaped law_number, so the two populations are
         -- disjoint and this can never override a working binding.
         COALESCE(lm.legislation_id, can.legislation_id, nb.legislation_id) lid,
         CASE WHEN lm.v IS NOT NULL THEN lm.method
              WHEN can.title IS NOT NULL AND nrm.v<>lcc.law_number THEN 'normalized'
              WHEN can.title IS NOT NULL THEN 'exact_title'
              WHEN nb.legislation_id IS NOT NULL THEN 'number' END method
  FROM public.law_court_citations lcc
  CROSS JOIN LATERAL (SELECT btrim(regexp_replace(lcc.law_number,'\s+',' ','g')) v) nrm
  LEFT JOIN lawmap lm ON lm.v = nrm.v
  LEFT JOIN canon can ON can.title = nrm.v
  LEFT JOIN numbermap nb ON nb.v = nrm.v),
withart AS (
  SELECT m.*, ba.article_id, ba.article_number
  FROM matched m
  LEFT JOIN best_art ba ON ba.legislation_id = m.lid AND ba.article_number = btrim(m.law_article)),
pick AS (
  SELECT DISTINCT ON (cid) doc_id, lid, article_id, article_number, law_number, law_article,
         citation_type, citation_context, v, method, cid
  FROM withart ORDER BY cid, (article_id IS NOT NULL) DESC, lid NULLS LAST)
SELECT doc_id, lid, article_id, article_number, law_number, law_article, citation_type, citation_context,
  CASE WHEN v='ВС' THEN 'unresolved' WHEN method IS NULL THEN 'unresolved' ELSE method END,
  (article_id IS NOT NULL),
  CASE WHEN article_id IS NOT NULL THEN NULL WHEN v='ВС' THEN 'not_legislation'
       WHEN lid IS NULL THEN 'law_not_in_registry' ELSE 'article_not_found' END,
  cid
FROM pick;
CREATE INDEX idx_lcl_doc_new ON public.legislation_citation_links_new(doc_id);
CREATE INDEX idx_lcl_article_new ON public.legislation_citation_links_new(article_id);
CREATE INDEX idx_lcl_legis_new ON public.legislation_citation_links_new(legislation_id, article_number);
CREATE INDEX idx_lcl_resolved_new ON public.legislation_citation_links_new(resolved);

-- The swap, and the check that gates it, are ONE transaction that first takes
-- an ACCESS EXCLUSIVE lock on the live table.
--
-- That is what actually makes this safe. The advisory lock above is only
-- best-effort: it is session-scoped, and no session-scoped mechanism survives
-- a transaction-pooled connection, so it can do no more than stop a second run
-- wasting 90 minutes. Correctness rests here instead — a transaction-scoped
-- table lock is honoured whatever the connection topology, and it serialises
-- the destructive step against any concurrent rebuild or writer. The row-count
-- comparison happens INSIDE that lock, so nothing can change between the
-- check and the swap.
BEGIN;

DO $swap$
DECLARE old_n bigint; new_n bigint;
BEGIN
  IF to_regclass('public.legislation_citation_links') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.legislation_citation_links IN ACCESS EXCLUSIVE MODE';
    EXECUTE 'SELECT count(*) FROM public.legislation_citation_links' INTO old_n;
  ELSE
    old_n := NULL;  -- first build, nothing to compare against
  END IF;

  SELECT count(*) INTO new_n FROM public.legislation_citation_links_new;

  IF old_n IS NULL THEN
    RAISE NOTICE 'first build: no live table to compare against, % rows', new_n;
  ELSIF new_n < old_n * 0.9 THEN
    RAISE EXCEPTION 'refusing swap: new table has % rows, live table has % (< 90%%)', new_n, old_n;
  ELSE
    RAISE NOTICE 'swap approved: % rows replacing %', new_n, old_n;
  END IF;
END
$swap$;

DROP TABLE IF EXISTS public.legislation_citation_links;
ALTER TABLE public.legislation_citation_links_new RENAME TO legislation_citation_links;
ALTER INDEX public.idx_lcl_doc_new      RENAME TO idx_lcl_doc;
ALTER INDEX public.idx_lcl_article_new  RENAME TO idx_lcl_article;
ALTER INDEX public.idx_lcl_legis_new    RENAME TO idx_lcl_legis;
ALTER INDEX public.idx_lcl_resolved_new RENAME TO idx_lcl_resolved;
-- The bigserial and the primary key were created under the _new name and keep
-- it through a table rename, so a later run would collide on
-- legislation_citation_links_new_pkey.
ALTER INDEX public.legislation_citation_links_new_pkey RENAME TO legislation_citation_links_pkey;
ALTER SEQUENCE public.legislation_citation_links_new_id_seq RENAME TO legislation_citation_links_id_seq;

COMMIT;

\echo '=== COVERAGE ==='
SELECT count(*) total, count(*) FILTER (WHERE resolved) resolved,
       round(100.0*count(*) FILTER (WHERE resolved)/count(*),1) pct,
       count(DISTINCT doc_id) decisions, count(DISTINCT article_id) FILTER (WHERE resolved) distinct_articles
FROM public.legislation_citation_links;
\echo '=== by match_method ==='
SELECT match_method, count(*) n, count(*) FILTER (WHERE resolved) res FROM public.legislation_citation_links GROUP BY 1 ORDER BY 2 DESC;
\echo '=== number leg (was repair-lcl-by-number.sql) ==='
SELECT count(*) n, count(*) FILTER (WHERE resolved) res, count(DISTINCT legislation_id) acts
FROM public.legislation_citation_links WHERE match_method = 'number';
\echo '=== unresolved by reason ==='
SELECT unresolved_reason, count(*) FROM public.legislation_citation_links WHERE NOT resolved GROUP BY 1 ORDER BY 2 DESC;
