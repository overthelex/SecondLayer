-- Migration 005: Fix voting_records duplicates and add dedup constraints
-- Problem: saveVotingRecord uses ON CONFLICT (id) with random UUID, so every
-- re-fetch of the same session date inserts duplicate rows instead of updating.
-- Solution: add a UNIQUE constraint on (session_date, question_number) as the
-- natural business key, deduplicate existing data first, and add a similar
-- constraint for deputy_court_mentions.

-- Step 1: Deduplicate voting_records — keep the row with the smallest ctid
-- (earliest physical insertion) for each (session_date, question_number) pair.
-- Rows where question_number IS NULL are left as-is (no natural key available).
DELETE FROM voting_records
WHERE ctid NOT IN (
  SELECT DISTINCT ON (session_date, question_number) ctid
  FROM voting_records
  WHERE question_number IS NOT NULL
  ORDER BY session_date, question_number, ctid
);

-- Step 2: Add UNIQUE constraint on (session_date, question_number)
-- Only index rows where question_number IS NOT NULL (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_voting_records_natural_key
  ON voting_records (session_date, question_number)
  WHERE question_number IS NOT NULL;

-- Step 3: Deduplicate deputy_court_mentions — keep the row with the smallest
-- ctid for each (deputy_id, court_case_number, mention_type) triple.
-- Rows where mention_type IS NULL are left as-is.
DELETE FROM deputy_court_mentions
WHERE ctid NOT IN (
  SELECT DISTINCT ON (deputy_id, court_case_number, mention_type) ctid
  FROM deputy_court_mentions
  WHERE mention_type IS NOT NULL
  ORDER BY deputy_id, court_case_number, mention_type, ctid
);

-- Step 4: Add UNIQUE constraint on (deputy_id, court_case_number, mention_type).
-- Partial index to guard against NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deputy_mentions_unique_key
  ON deputy_court_mentions (deputy_id, court_case_number, mention_type)
  WHERE mention_type IS NOT NULL;
