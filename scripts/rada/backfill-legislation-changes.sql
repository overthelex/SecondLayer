-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill legislation_changes from per-edition article snapshots
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY:
--   legislation_changes is empty, so the "most-changed articles" feature falls
--   back to counting *editions* (every article shows N versions == N editions),
--   which is wrong. This script reconstructs the real edit history by walking the
--   per-edition snapshots stored in legislation_articles and emitting one row per
--   actual added / modified / removed event.
--
-- DATA FACTS (verified on prod, 2026-06-29):
--   * legislation_articles holds exactly 1 row per (legislation_id, article_number,
--     edition) — no part-splitting.
--   * Every real article version_date aligns with a legislation_editions.edition_date.
--   * A synthetic placeholder row (date 2000-01-01, NOT an edition date) exists per
--     article; it is excluded naturally by joining text to the editions timeline.
--   * is_current is NOT used for filtering: the importer toggles it onto the latest
--     real edition (e.g. 2024-10-06), so filtering on it would drop a real edition
--     and emit phantom 'removed' events. The editions join is the source of truth.
--
-- SEMANTICS (matches legislation-monitoring-service.ts):
--   added    -> old_text NULL,     new_text=current,  diff_html NULL
--   modified -> old_text=previous,  new_text=current,  diff_html NULL (compute lazily)
--   removed  -> old_text=previous,  new_text NULL,     diff_html NULL
--
--   "Number of amendments to article N" == COUNT(*) WHERE change_type='modified'.
--   The original adoption of an article is recorded as 'added' (not an amendment).
--
-- IDEMPOTENT: a unique natural key + ON CONFLICT DO NOTHING means re-running is
--   safe and will not duplicate or clobber rows the live monitor inserts later.
--
-- RUN (prod, server-side — no data egress):
--   docker exec -i secondlayer-postgres-prod \
--     psql -U secondlayer -d secondlayer_prod -v ONLY_LAW=0 \
--     < scripts/rada/backfill-legislation-changes.sql
--
--   Scope to a single law for testing:  -v ONLY_LAW=298
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on
\if :{?ONLY_LAW} \else \set ONLY_LAW 0 \endif

BEGIN;

-- Natural key: one event per (law, article, edition, type). Live monitor inserts
-- (which also carry version_date) dedupe against the backfill via this index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leg_changes_event
  ON legislation_changes (legislation_id, article_number, version_date, change_type);

WITH
-- Canonical, authoritative edition timeline (1 row per edition).
ed AS (
  SELECT legislation_id,
         edition_date,
         row_number() OVER (PARTITION BY legislation_id ORDER BY edition_date) AS rn
  FROM legislation_editions
  WHERE (:ONLY_LAW = 0 OR legislation_id = :ONLY_LAW)
),
-- Article text per (law, article, edition). One row per (law, article, date);
-- is_current is ignored. The synthetic placeholder date drops out at the editions
-- join below (its date is not a real edition). DISTINCT ON guards against an edition
-- date appearing twice (e.g. an is_current=true copy alongside an is_current=false one).
art AS (
  SELECT DISTINCT ON (legislation_id, article_number, version_date::date)
         legislation_id,
         article_number,
         version_date::date AS edition_date,
         full_text          AS raw_text,
         regexp_replace(coalesce(full_text, ''), '\s+', ' ', 'g') AS norm
  FROM legislation_articles
  WHERE article_number IS NOT NULL
    AND (:ONLY_LAW = 0 OR legislation_id = :ONLY_LAW)
  ORDER BY legislation_id, article_number, version_date::date, is_current DESC
),
-- Full grid: every article crossed with every edition of its law (so gaps where an
-- article disappears or reappears become visible for removed/added detection).
grid AS (
  SELECT al.legislation_id,
         al.article_number,
         e.rn,
         e.edition_date,
         a.raw_text,
         a.norm,
         (a.norm IS NOT NULL) AS present
  FROM (SELECT DISTINCT legislation_id, article_number FROM art) al
  JOIN ed  e ON e.legislation_id = al.legislation_id
  LEFT JOIN art a ON a.legislation_id = al.legislation_id
                 AND a.article_number = al.article_number
                 AND a.edition_date   = e.edition_date
),
-- Compare each cell to the previous edition of the same article.
walk AS (
  SELECT legislation_id, article_number, edition_date, present, raw_text, norm,
         lag(present)  OVER w AS prev_present,
         lag(norm)     OVER w AS prev_norm,
         lag(raw_text) OVER w AS prev_raw
  FROM grid
  WINDOW w AS (PARTITION BY legislation_id, article_number ORDER BY rn)
),
events AS (
  SELECT
    legislation_id, article_number, edition_date,
    CASE
      WHEN present AND prev_present IS DISTINCT FROM true       THEN 'added'
      WHEN present AND prev_present AND norm <> prev_norm        THEN 'modified'
      WHEN (NOT present) AND prev_present                        THEN 'removed'
    END AS change_type,
    CASE
      WHEN present AND prev_present AND norm <> prev_norm        THEN prev_raw  -- modified
      WHEN (NOT present) AND prev_present                        THEN prev_raw  -- removed
    END AS old_text,
    CASE
      WHEN present AND prev_present IS DISTINCT FROM true        THEN raw_text  -- added
      WHEN present AND prev_present AND norm <> prev_norm        THEN raw_text  -- modified
    END AS new_text
  FROM walk
)
INSERT INTO legislation_changes
  (legislation_id, rada_id, article_number, change_type,
   old_text, new_text, diff_html, version_date, detected_at)
SELECT ev.legislation_id, l.rada_id, ev.article_number, ev.change_type,
       ev.old_text, ev.new_text, NULL,
       ev.edition_date::timestamptz, now()
FROM events ev
JOIN legislation l ON l.id = ev.legislation_id
WHERE ev.change_type IS NOT NULL
ON CONFLICT (legislation_id, article_number, version_date, change_type) DO NOTHING;

-- Report what was produced in this run's scope.
SELECT change_type, count(*) AS rows
FROM legislation_changes
WHERE (:ONLY_LAW = 0 OR legislation_id = :ONLY_LAW)
GROUP BY change_type
ORDER BY change_type;

COMMIT;
