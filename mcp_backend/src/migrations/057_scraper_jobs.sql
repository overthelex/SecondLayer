-- Migration 057: Add scraper_jobs table for persistent job tracking
-- Allows backfill and court scraper jobs to survive server restarts / browser close+reopen
-- Date: 2026-02-23

BEGIN;

CREATE TABLE IF NOT EXISTS scraper_jobs (
  id           SERIAL PRIMARY KEY,
  job_id       TEXT UNIQUE NOT NULL,
  job_type     TEXT NOT NULL,                      -- 'court_scraper' | 'backfill'
  status       TEXT NOT NULL DEFAULT 'queued',     -- queued|running|completed|failed|stopped|interrupted
  config       JSONB NOT NULL DEFAULT '{}',        -- job parameters (immutable after start)
  progress     JSONB NOT NULL DEFAULT '{}',        -- counters updated during job
  current_logs TEXT[] NOT NULL DEFAULT '{}',       -- last N log lines
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_jobs_status     ON scraper_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_started_at ON scraper_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_job_type   ON scraper_jobs(job_type);

COMMIT;
