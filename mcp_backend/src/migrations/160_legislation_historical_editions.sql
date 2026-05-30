-- Historical legislation editions support
-- Enables storage and fast temporal lookup of all historical editions of Ukrainian codes

-- 1. Composite index for O(1) temporal lookups: "article X as of date Y"
CREATE INDEX IF NOT EXISTS idx_articles_temporal_lookup
ON legislation_articles (legislation_id, article_number, version_date DESC);

-- 2. Create legislation_editions table (tracks available editions per code)
CREATE TABLE IF NOT EXISTS legislation_editions (
  id SERIAL PRIMARY KEY,
  legislation_id INTEGER NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
  edition_date DATE NOT NULL,
  edition_key VARCHAR(8) NOT NULL, -- YYYYMMDD from zakon.rada.gov.ua URL
  article_count INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(legislation_id, edition_date)
);

CREATE INDEX IF NOT EXISTS idx_editions_legislation_date
ON legislation_editions (legislation_id, edition_date DESC);

-- 3. Track total editions on legislation table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legislation' AND column_name = 'total_editions'
  ) THEN
    ALTER TABLE legislation ADD COLUMN total_editions INTEGER DEFAULT 0;
  END IF;
END $$;

-- 4. Partial index for maintenance queries on historical articles
CREATE INDEX IF NOT EXISTS idx_articles_historical
ON legislation_articles (legislation_id, version_date)
WHERE is_current = false;
