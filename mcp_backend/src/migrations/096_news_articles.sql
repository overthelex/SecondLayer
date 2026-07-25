-- News articles cache with AI analysis
CREATE TABLE IF NOT EXISTS news_articles (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT,
  analysis TEXT,
  scraped_at TIMESTAMPTZ,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_articles_url ON news_articles(url);
