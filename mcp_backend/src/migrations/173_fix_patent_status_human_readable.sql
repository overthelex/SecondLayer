-- 173_fix_patent_status_human_readable.sql
-- Backfill opendata_patents.status to the human-readable form the corrected extractor
-- now produces, matching opendata_trademarks (see migration 172).
--
-- Patents previously stored the raw NIPO colour flag ("red"/"green"/"yellow") in status,
-- while trademarks store human-readable text. This harmonises the two tables:
--   green  → active   (in force)
--   red    → inactive (not in force)
--   yellow → pending  (registered but awaiting an action, e.g. an annual fee)
--
-- Idempotent: only rows whose status actually differs are touched.

SET statement_timeout = '10min';

UPDATE opendata_patents
SET status = CASE raw_data->>'registration_status_color'
               WHEN 'green'  THEN 'active'
               WHEN 'red'    THEN 'inactive'
               WHEN 'yellow' THEN 'pending'
               ELSE status
             END
WHERE status IS DISTINCT FROM (
        CASE raw_data->>'registration_status_color'
          WHEN 'green'  THEN 'active'
          WHEN 'red'    THEN 'inactive'
          WHEN 'yellow' THEN 'pending'
          ELSE status
        END
      );
