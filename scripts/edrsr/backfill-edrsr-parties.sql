-- backfill-edrsr-parties.sql  (LEXAI-1760)
--
-- Extract плаінтифф/відповідач spans from the EDRSR claim clause ("за позовом X до Y про …")
-- for ONE adjudication year into edrsr_parties. In-DB only (no egress), idempotent (rebuilds
-- the year), and partition-scoped so it can be run per year, off-peak, in tmux.
--
-- Usage (run ON the prod DB host — never pull the corpus to local, egress is paid):
--   ssh prod 'docker exec -i secondlayer-postgres-prod \
--     psql -U secondlayer -d secondlayer_prod -v year=2023' < scripts/edrsr/backfill-edrsr-parties.sql
--
-- The caption is taken from the first 3000 chars (вступна частина) which both bounds the
-- regex cost and avoids matching a "позовом … до … про" phrase deep in the body. Only
-- civil/commercial/administrative kinds (justice_kind 1,3,4) carry this caption; criminal /
-- КУпАП use a different formula and are left for phase 2.

\set ON_ERROR_STOP on
\timing on

BEGIN;
-- This is a bulk maintenance job, not a request — let it run to completion.
SET LOCAL statement_timeout = '0';

-- Idempotent rebuild: drop any rows previously extracted for this year.
DELETE FROM edrsr_parties WHERE adj_year = :year;

WITH src AS (
  SELECT
    f.doc_id,
    d.court_code,
    d.justice_kind,
    d.adjudication_date,
    regexp_match(
      left(f.full_text, 3000),
      -- (optional) "за" + optional qualifier, "позов…", capture PLAINTIFF up to " до ",
      -- capture DEFENDANT up to " про "/" щодо ".
      -- NB: POSIX RE_DUP_MAX caps a {m,n} bound at 255 — keep every repetition count ≤ 255.
      '(?:за\s+)?(?:адміністративн[а-яіїєґ]*\s+|зустрічн[а-яіїєґ]*\s+)?позов(?:ною\s+заявою|ом|у|и|ами|ів)?\s+(.{3,250}?)\s+до\s+(.{3,250}?)\s+(?:про|щодо)\s',
      'i'
    ) AS m
  FROM edrsr_fulltext f
  JOIN edrsr_documents d ON d.doc_id = f.doc_id
  WHERE f.adj_year = :year
    AND d.justice_kind IN (1, 3, 4)
),
matched AS (
  SELECT doc_id, court_code, justice_kind, adjudication_date,
         m[1] AS plaintiff_raw, m[2] AS defendant_raw
  FROM src
  WHERE m IS NOT NULL
),
unpiv AS (
  SELECT doc_id, court_code, justice_kind, adjudication_date, v.role, v.name_raw
  FROM matched
  CROSS JOIN LATERAL (VALUES
    (1::smallint, plaintiff_raw),
    (2::smallint, defendant_raw)
  ) AS v(role, name_raw)
  WHERE v.name_raw IS NOT NULL
)
INSERT INTO edrsr_parties (doc_id, role, ord, name_raw, name_norm, court_code, justice_kind, adjudication_date, adj_year)
SELECT
  doc_id,
  role,
  1,
  btrim(name_raw),
  -- normalise: strip quotes, lower-case, collapse whitespace, trim edge punctuation.
  btrim(
    regexp_replace(
      lower(regexp_replace(name_raw, '[«»"“”'']', '', 'g')),
      '\s+', ' ', 'g'
    ),
    ' .,;:-—'
  ),
  court_code,
  justice_kind,
  adjudication_date,
  :year
FROM unpiv
WHERE length(btrim(name_raw)) BETWEEN 3 AND 400
ON CONFLICT (doc_id, role, ord, adj_year) DO NOTHING;

-- Record coverage so countByParty knows this year is served by the table.
INSERT INTO edrsr_parties_coverage (adj_year, doc_count, party_count, built_at)
SELECT
  :year,
  (SELECT count(*) FROM edrsr_fulltext WHERE adj_year = :year),
  (SELECT count(*) FROM edrsr_parties  WHERE adj_year = :year),
  now()
ON CONFLICT (adj_year) DO UPDATE
  SET doc_count = EXCLUDED.doc_count,
      party_count = EXCLUDED.party_count,
      built_at = now();

COMMIT;

-- Quick post-build sanity numbers.
SELECT adj_year, doc_count, party_count, built_at FROM edrsr_parties_coverage WHERE adj_year = :year;
SELECT role, count(*) AS rows, count(DISTINCT doc_id) AS docs
FROM edrsr_parties WHERE adj_year = :year GROUP BY role ORDER BY role;
