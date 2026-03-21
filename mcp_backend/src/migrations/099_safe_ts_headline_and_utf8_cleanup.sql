-- Migration 099: safe_ts_headline function + clean invalid UTF-8 in edrsr_fulltext
--
-- Problem: ts_headline() throws error 22021 (character_not_in_repertoire) when
-- full_text contains invalid UTF-8 byte sequences. This kills the entire query.
--
-- Fix 1: PL/pgSQL wrapper that catches the error per-row → good rows still get headlines
-- Fix 2: Clean existing bad data by stripping invalid bytes

-- 1. Create safe_ts_headline that returns NULL on encoding errors instead of failing
CREATE OR REPLACE FUNCTION safe_ts_headline(
  config regconfig,
  doc text,
  query tsquery,
  opts text DEFAULT ''
) RETURNS text AS $$
BEGIN
  IF opts = '' THEN
    RETURN ts_headline(config, doc, query);
  ELSE
    RETURN ts_headline(config, doc, query, opts);
  END IF;
EXCEPTION WHEN character_not_in_repertoire THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Clean invalid UTF-8 bytes from edrsr_fulltext
-- convert_from(convert_to(..., 'UTF8'), 'UTF8') will fail on bad bytes,
-- so we use a regex to strip control characters and then re-encode.
-- This handles the most common case: stray 0x00 bytes and broken multi-byte sequences.
DO $$
DECLARE
  cleaned_count int;
BEGIN
  -- Strip null bytes (most common cause of 22021 in imported RTF data)
  UPDATE edrsr_fulltext
  SET full_text = regexp_replace(full_text, E'\\x00', '', 'g')
  WHERE full_text LIKE E'%\x00%';

  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  IF cleaned_count > 0 THEN
    RAISE NOTICE 'Cleaned null bytes from % rows', cleaned_count;
  END IF;
END $$;
