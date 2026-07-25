-- Sampled document-frequency of FTS lexemes from edrsr_fulltext, used for
-- IDF-weighted keyword selection in the unified court search (CORE-21 P1.5a):
-- keep discriminative terms (e.g. "донецьк", "окупован", "дррп"), drop common
-- ones ("податок", "майно") when relaxing the all-AND plainto_tsquery.
--
-- This migration ONLY creates the (initially empty) table. edrsr_fulltext has
-- ~296M rows, so the heavy ts_stat populate is OUT OF BAND — see
-- scripts/edrsr/build-lexeme-df.sql, run off-peak on the local DB-proxy and
-- exported to prod, then refreshed by the EDRSR cron. The search path is
-- fallback-safe: an empty/missing table -> current positional behaviour.

CREATE TABLE IF NOT EXISTS edrsr_lexeme_df (
  lexeme      TEXT PRIMARY KEY,        -- 'simple'-config lexeme == lowercased token
  df          BIGINT NOT NULL,         -- docs containing the lexeme in the sample
  sample_docs BIGINT NOT NULL,         -- sample size -> idf = ln(sample_docs / df)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE edrsr_lexeme_df IS
  'Sampled FTS lexeme document-frequency for IDF term selection (CORE-21 P1.5a); populated out-of-band by scripts/edrsr/build-lexeme-df.sql, refreshed by the EDRSR cron.';
