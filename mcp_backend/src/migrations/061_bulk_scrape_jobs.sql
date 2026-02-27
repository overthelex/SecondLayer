-- Migration 061: Bulk scrape jobs tracking table
-- Tracks distributed court decision scraping pipeline phases

CREATE TABLE IF NOT EXISTS bulk_scrape_jobs (
  id SERIAL PRIMARY KEY,
  job_id TEXT UNIQUE NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('discovery', 'enqueue', 'download', 'process', 'embed')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped')),
  total_docs INTEGER NOT NULL DEFAULT 0,
  processed_docs INTEGER NOT NULL DEFAULT 0,
  failed_docs INTEGER NOT NULL DEFAULT 0,
  skipped_docs INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_scrape_jobs_phase ON bulk_scrape_jobs(phase);
CREATE INDEX IF NOT EXISTS idx_bulk_scrape_jobs_status ON bulk_scrape_jobs(status);

-- Trigger to auto-update updated_at
DO $$ BEGIN
  CREATE TRIGGER bulk_scrape_jobs_updated_at
    BEFORE UPDATE ON bulk_scrape_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
