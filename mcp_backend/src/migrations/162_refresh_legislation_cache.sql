-- Migration 162: Invalidate ALL legislation article caches so they get re-fetched
-- with corrected parser that preserves amendment annotations.
--
-- The parser was stripping <em>{...}</em> amendment notes (e.g. "Частина четверта
-- статті 310 в редакції Закону № 4173-IX від 19.12.2024") from full_text.
-- This affected ALL legislation, not just КАС.

DO $$
DECLARE
  deleted_count INTEGER;
  updated_count INTEGER;
BEGIN
  DELETE FROM legislation_articles;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  UPDATE legislation SET total_articles = 0, updated_at = NOW();
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RAISE NOTICE 'Cleared % stale articles across % laws. Re-fetch on next access.', deleted_count, updated_count;
END;
$$;
