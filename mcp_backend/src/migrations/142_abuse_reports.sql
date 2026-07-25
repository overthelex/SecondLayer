-- Migration 141: Abuse reports table
-- Public abuse/violation reporting channel for legal compliance.

CREATE TABLE IF NOT EXISTS abuse_reports (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  description   TEXT NOT NULL,
  content_url   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports (status);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_created ON abuse_reports (created_at DESC);
