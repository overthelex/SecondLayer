-- LEXAI-1770: Fix legislation codes that have articles but ZERO is_current=true.
--
-- Root cause: codes imported ONLY via scripts/rada/import-historical-editions.ts
-- insert every edition with is_current=false (hardcoded). The "current redaction"
-- is normally flagged by RadaLegislationAdapter.saveLegislationToDatabase
-- (is_current=true), but these codes never went through that path, so 0 rows are
-- current. This breaks citation resolution AND LegislationService /
-- get_legislation_section (all of which filter WHERE is_current = true).
--
-- Known affected (prod, 2026-06): 647, 648, 650, 660, 661, 662
-- (Кримінально-виконавчий, Кодекс цив. захисту, ГПК, Конституція, ЦПК, Митний).
--
-- Corrective rule (generic, self-healing): for every legislation_id that has
-- articles but no current ones, pick the CURRENT REDACTION = the latest edition
-- whose version_date <= today (ignores future-dated / not-yet-effective editions,
-- e.g. ЦПК 2028-01-01), and flag exactly that edition's articles is_current=true.
-- Idempotent: re-running is a no-op because affected codes will then have >0 current.

DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Codes with articles but zero current articles.
  WITH broken AS (
    SELECT legislation_id
    FROM legislation_articles
    GROUP BY legislation_id
    HAVING COUNT(*) > 0
       AND COUNT(*) FILTER (WHERE is_current) = 0
  ),
  -- Current redaction per broken code = latest edition effective on/before today.
  -- Fall back to the overall latest edition if every edition is future-dated.
  chosen AS (
    SELECT DISTINCT ON (la.legislation_id)
           la.legislation_id,
           la.version_date
    FROM legislation_articles la
    JOIN broken b ON b.legislation_id = la.legislation_id
    ORDER BY la.legislation_id,
             (la.version_date::date <= CURRENT_DATE) DESC,  -- prefer effective editions
             la.version_date DESC                            -- then newest
  )
  UPDATE legislation_articles la
  SET is_current = true,
      updated_at = NOW()
  FROM chosen c
  WHERE la.legislation_id = c.legislation_id
    AND la.version_date   = c.version_date
    AND la.is_current = false;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'LEXAI-1770: flagged % articles as is_current across previously-broken codes', affected_count;
END $$;
