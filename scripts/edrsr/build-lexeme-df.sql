-- Rebuild edrsr_lexeme_df from a sample of edrsr_fulltext (CORE-21 P1.5a).
--
-- HEAVY: ts_stat aggregates every lexeme across the sampled tsvectors. Run
-- OFF-PEAK on the local DB-proxy, then export the table to prod (local->prod
-- pattern). Idempotent — safe to re-run; refreshed by the EDRSR cron.
--
-- Sample size: 0.3% of ~296M rows ~= 900k docs — enough to rank "податок"
-- (almost everywhere) below "донецьк" (rare). REPEATABLE makes the count and
-- the ts_stat see the SAME sample, so sample_docs matches the df corpus.
-- If ts_stat runs too long, drop the sample to SYSTEM (0.1).
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/edrsr/build-lexeme-df.sql

SET statement_timeout = '45min';

BEGIN;

TRUNCATE edrsr_lexeme_df;

INSERT INTO edrsr_lexeme_df (lexeme, df, sample_docs, updated_at)
SELECT
  s.word,
  s.ndoc,
  (SELECT count(*)::bigint
     FROM edrsr_fulltext TABLESAMPLE SYSTEM (0.3) REPEATABLE (42)),
  NOW()
FROM ts_stat(
  $$SELECT tsv FROM edrsr_fulltext TABLESAMPLE SYSTEM (0.3) REPEATABLE (42)$$
) AS s(word, ndoc, nentry)
WHERE s.ndoc >= 3;   -- drop hapax/OCR noise

COMMIT;

ANALYZE edrsr_lexeme_df;

-- Sanity: most common terms should have the largest df.
-- SELECT lexeme, df FROM edrsr_lexeme_df ORDER BY df DESC LIMIT 10;
