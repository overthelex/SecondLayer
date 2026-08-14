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

DROP TABLE IF EXISTS legislation_citation_links_new;
CREATE TABLE legislation_citation_links_new (
  id bigserial PRIMARY KEY, doc_id bigint NOT NULL, legislation_id integer, article_id integer,
  article_number varchar, law_number_raw text NOT NULL, law_article_raw text, citation_type text,
  citation_context text, match_method text NOT NULL, resolved boolean NOT NULL DEFAULT false,
  unresolved_reason text, src_citation_id bigint, created_at timestamptz DEFAULT now());
INSERT INTO legislation_citation_links_new
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
numbermap AS (
  -- Exactly one act, or nothing. The date pins the convocation; a bare core
  -- must be globally unique. That is what keeps the three-way КУпАП split and
  -- the 70 cross-era Roman collisions off the wrong act.
  --
  -- legislation_id references public.legislation (651 curated acts), so a
  -- citation naming any of the other ~292 000 has no id to point at and stays
  -- unresolved however well its number parses. That cap is structural.
  SELECT p.v, min(pl.id) AS legislation_id
  FROM numparse p
  JOIN npa.act_number an ON an.alias_norm = npa.norm_number(p.core) AND an.kind = 'core_only'
  JOIN npa.act a         ON a.nreg = an.nreg AND (p.dt IS NULL OR a.first_ed = p.dt)
  JOIN public.legislation pl ON lower(pl.rada_id) = an.nreg
  WHERE p.core IS NOT NULL
  GROUP BY p.v
  HAVING count(DISTINCT an.nreg) = 1),
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
CREATE INDEX idx_lcl_doc_new ON legislation_citation_links_new(doc_id);
CREATE INDEX idx_lcl_article_new ON legislation_citation_links_new(article_id);
CREATE INDEX idx_lcl_legis_new ON legislation_citation_links_new(legislation_id, article_number);
CREATE INDEX idx_lcl_resolved_new ON legislation_citation_links_new(resolved);

-- Refuse to swap in a table that is obviously worse than the one being
-- replaced. A rebuild that lost most of the graph must not go live silently.
DO $guard$
DECLARE old_n bigint; new_n bigint;
BEGIN
  SELECT count(*) INTO new_n FROM legislation_citation_links_new;
  SELECT count(*) INTO old_n FROM legislation_citation_links;
  IF new_n < old_n * 0.9 THEN
    RAISE EXCEPTION 'refusing swap: new table has % rows, live table has % (< 90%%)', new_n, old_n;
  END IF;
END
$guard$;

BEGIN;
DROP TABLE legislation_citation_links;
ALTER TABLE legislation_citation_links_new RENAME TO legislation_citation_links;
ALTER INDEX idx_lcl_doc_new      RENAME TO idx_lcl_doc;
ALTER INDEX idx_lcl_article_new  RENAME TO idx_lcl_article;
ALTER INDEX idx_lcl_legis_new    RENAME TO idx_lcl_legis;
ALTER INDEX idx_lcl_resolved_new RENAME TO idx_lcl_resolved;
COMMIT;
\echo '=== COVERAGE ==='
SELECT count(*) total, count(*) FILTER (WHERE resolved) resolved,
       round(100.0*count(*) FILTER (WHERE resolved)/count(*),1) pct,
       count(DISTINCT doc_id) decisions, count(DISTINCT article_id) FILTER (WHERE resolved) distinct_articles
FROM legislation_citation_links;
\echo '=== by match_method ==='
SELECT match_method, count(*) n, count(*) FILTER (WHERE resolved) res FROM legislation_citation_links GROUP BY 1 ORDER BY 2 DESC;
\echo '=== number leg (was repair-lcl-by-number.sql) ==='
SELECT count(*) n, count(*) FILTER (WHERE resolved) res, count(DISTINCT legislation_id) acts
FROM legislation_citation_links WHERE match_method = 'number';
\echo '=== unresolved by reason ==='
SELECT unresolved_reason, count(*) FROM legislation_citation_links WHERE NOT resolved GROUP BY 1 ORDER BY 2 DESC;
