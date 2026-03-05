-- Search history for lawyers page (and potentially other search pages)
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page VARCHAR(50) NOT NULL DEFAULT 'lawyers',
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_page
  ON search_history (user_id, page, created_at DESC);

-- Prevent exact duplicate consecutive searches per user/page
-- (keep only the latest timestamp via application logic)
