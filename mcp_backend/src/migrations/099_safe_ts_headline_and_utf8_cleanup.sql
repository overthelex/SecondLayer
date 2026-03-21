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

-- 2. Note: null byte cleanup removed — PostgreSQL text columns cannot contain
-- literal 0x00 bytes, so the encoding errors come from other invalid sequences.
-- safe_ts_headline handles these per-row at query time.
