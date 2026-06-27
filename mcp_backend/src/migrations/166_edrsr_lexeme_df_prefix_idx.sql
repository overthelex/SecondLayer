-- Prefix index on edrsr_lexeme_df.lexeme for fast `lexeme LIKE 'stem%'` prefix-DF
-- lookups (LEXAI Cause-A.2 / token→vocabulary snap). The default PK btree uses the
-- database collation, which does NOT accelerate LIKE prefix scans; text_pattern_ops
-- gives byte-ordered ranges so the snap (longest corpus stem with df ≥ floor) is an
-- index range scan instead of a 988k-row seq scan per candidate prefix.
--
-- Small table (~1M rows) → plain CREATE INDEX (brief lock) is fine; the migration
-- runner wraps statements in a txn, so CONCURRENTLY is intentionally NOT used.

CREATE INDEX IF NOT EXISTS edrsr_lexeme_df_lexeme_prefix
  ON edrsr_lexeme_df (lexeme text_pattern_ops);
