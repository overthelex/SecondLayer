-- Judge analytics: pre-computed per-judge metrics from EDRSR (82M+ court decisions)
-- Stores aggregated statistics for ~5,743 active judges (2022-2026)
-- Populated by compute-judge-analytics.ts script

CREATE TABLE IF NOT EXISTS judge_analytics (
  id SERIAL PRIMARY KEY,
  judge_name TEXT NOT NULL,
  court_code INTEGER,
  court_name TEXT,
  instance_code SMALLINT,
  instance_name TEXT,
  dossier_number VARCHAR(50),

  -- Decision counts
  total_decisions INTEGER NOT NULL DEFAULT 0,
  unique_cases INTEGER NOT NULL DEFAULT 0,
  cases_appealed INTEGER NOT NULL DEFAULT 0,
  appeal_rate NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Breakdowns (JSONB)
  decisions_by_year JSONB DEFAULT '{}',
  decisions_by_form JSONB DEFAULT '{}',
  decisions_by_justice_kind JSONB DEFAULT '{}',
  top_categories JSONB DEFAULT '[]',

  -- Appeal outcome analysis (from fulltext)
  appeal_outcomes JSONB DEFAULT '{"upheld":0,"overturned":0,"modified":0,"unknown":0,"analyzed":0}',

  -- VKKSU efficiency data (from judge_efficiency table)
  vkksu_data JSONB DEFAULT '{}',

  -- Peer comparison
  peer_rank_in_court INTEGER,
  peer_total_in_court INTEGER,
  court_avg_decisions NUMERIC(10,2),

  -- Metadata
  period_start DATE DEFAULT '2022-01-01',
  period_end DATE DEFAULT '2026-12-31',
  computed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(judge_name, court_code)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ja_judge_name ON judge_analytics(judge_name);
CREATE INDEX IF NOT EXISTS idx_ja_court_code ON judge_analytics(court_code);
CREATE INDEX IF NOT EXISTS idx_ja_total_decisions_desc ON judge_analytics(total_decisions DESC);
CREATE INDEX IF NOT EXISTS idx_ja_appeal_rate_desc ON judge_analytics(appeal_rate DESC);
CREATE INDEX IF NOT EXISTS idx_ja_instance_code ON judge_analytics(instance_code);
CREATE INDEX IF NOT EXISTS idx_ja_dossier ON judge_analytics(dossier_number);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_judge_analytics_updated_at') THEN
        CREATE TRIGGER update_judge_analytics_updated_at BEFORE UPDATE ON judge_analytics
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
