-- Fix FTS language: 'english' → 'simple' for Ukrainian text
-- English stemmer provides no benefit for Cyrillic text

-- bills.title
DROP INDEX IF EXISTS idx_bills_title;
CREATE INDEX IF NOT EXISTS idx_bills_title ON bills USING gin(to_tsvector('simple', title));

-- legislation.title
DROP INDEX IF EXISTS idx_legislation_title;
CREATE INDEX IF NOT EXISTS idx_legislation_title ON legislation USING gin(to_tsvector('simple', title));

-- legislation.full_text_plain
DROP INDEX IF EXISTS idx_legislation_fulltext;
CREATE INDEX IF NOT EXISTS idx_legislation_fulltext ON legislation USING gin(to_tsvector('simple', full_text_plain));

-- voting_records.question_text
DROP INDEX IF EXISTS idx_voting_question;
CREATE INDEX IF NOT EXISTS idx_voting_question ON voting_records USING gin(to_tsvector('simple', question_text));
