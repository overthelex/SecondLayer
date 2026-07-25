-- 172_fix_trademark_expiry_status.sql
-- Backfill opendata_trademarks.expiry_date and status to match the corrected extractor.
--
-- Two extraction defects (fixed in import-uipv-ip.ts extractTrademark):
--   1. expiry_date read the original 10-year `ExpiryDate` and ignored renewals. NIPO keeps
--      the original date after a prolongation; the effective term end lives in
--      `ProlonagationExpiryDate` (NIPO's spelling). ~90K renewed marks showed a long-past
--      expiry (e.g. TM 67482: stored 2016-04-04, actually renewed to 2026-04-04).
--   2. status came from `application_status` ("active"), which mislabels ~127K expired/
--      terminated marks as active. `registration_status_color` (green=in force, red=not) is
--      the authoritative live/dead flag — the same source patents already use.
--
-- Idempotent: re-running produces the same rows; only rows that actually change are touched.

SET statement_timeout = '10min';

UPDATE opendata_trademarks t
SET
  expiry_date = v.new_expiry,
  status      = v.new_status
FROM (
  SELECT
    id,
    COALESCE(
      NULLIF(LEFT(raw_data->>'ProlonagationExpiryDate', 10), '')::date,
      NULLIF(LEFT(raw_data->>'ExpiryDate', 10), '')::date,
      expiry_date
    ) AS new_expiry,
    CASE raw_data->>'registration_status_color'
      WHEN 'green' THEN 'active'
      WHEN 'red'   THEN 'inactive'
      ELSE COALESCE(NULLIF(raw_data->>'application_status', ''), status)
    END AS new_status
  FROM opendata_trademarks
) v
WHERE t.id = v.id
  AND (
    t.expiry_date IS DISTINCT FROM v.new_expiry
    OR t.status   IS DISTINCT FROM v.new_status
  );
