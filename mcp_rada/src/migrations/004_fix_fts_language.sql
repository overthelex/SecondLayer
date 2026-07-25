-- Fix FTS language: 'english' → 'simple' for Ukrainian text
-- English stemmer provides no benefit for Cyrillic text
-- Idempotent: only recreates indexes if they use the wrong language config

DO $$
BEGIN
  -- bills.title
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bills_title'
    AND indexdef LIKE '%simple%'
  ) THEN
    DROP INDEX IF EXISTS idx_bills_title;
    CREATE INDEX idx_bills_title ON bills USING gin(to_tsvector('simple', title));
  END IF;

  -- legislation.title
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_legislation_title'
    AND indexdef LIKE '%simple%' AND schemaname = current_schema()
  ) THEN
    DROP INDEX IF EXISTS idx_legislation_title;
    CREATE INDEX idx_legislation_title ON legislation USING gin(to_tsvector('simple', title));
  END IF;

  -- legislation.full_text_plain
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_legislation_fulltext'
    AND indexdef LIKE '%simple%'
  ) THEN
    DROP INDEX IF EXISTS idx_legislation_fulltext;
    CREATE INDEX idx_legislation_fulltext ON legislation USING gin(to_tsvector('simple', full_text_plain));
  END IF;

  -- voting_records.question_text
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_voting_question'
    AND indexdef LIKE '%simple%'
  ) THEN
    DROP INDEX IF EXISTS idx_voting_question;
    CREATE INDEX idx_voting_question ON voting_records USING gin(to_tsvector('simple', question_text));
  END IF;
END $$;
