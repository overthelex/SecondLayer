-- Load test results table (persistent — no FK to users since test users are deleted after runs)
CREATE TABLE IF NOT EXISTS load_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id VARCHAR(100) NOT NULL,
  wave VARCHAR(20) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_id UUID,
  query TEXT NOT NULL,
  expected_tool VARCHAR(200),
  tool_triggered VARCHAR(200),
  tools_used JSONB DEFAULT '[]',
  response_text TEXT,
  response_time_ms INTEGER,
  first_byte_ms INTEGER,
  tokens_used INTEGER,
  cost_usd DECIMAL(10,6),
  charged_usd DECIMAL(10,6),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  thinking_steps INTEGER DEFAULT 0,
  response_id VARCHAR(255),
  conversation_id UUID,
  raw_events JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_load_test_run ON load_test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_load_test_status ON load_test_results(status);
CREATE INDEX IF NOT EXISTS idx_load_test_created ON load_test_results(created_at DESC);
