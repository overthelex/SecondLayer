-- Migration 099: safe_ts_headline function + clean invalid UTF-8 in edrsr_fulltext
--
-- Problem: ts_headline() throws error 22021 (character_not_in_repertoire) when
-- LEFT(full_text, N) cuts a multi-byte UTF-8 character mid-sequence.
-- This kills the entire query even though ts_headline on full text works fine.
--
-- Fix: PL/pgSQL wrapper that passes full text to ts_headline (MaxWords limits output)
-- and catches any remaining encoding errors per-row → good rows still get headlines

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
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
