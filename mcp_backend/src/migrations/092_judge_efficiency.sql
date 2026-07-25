-- Judge efficiency data from VKKSU open data
-- Source: https://data.gov.ua/dataset/3cb19867-4cdc-495d-904c-d870ecf3d557
-- Data: 2024 year

CREATE TABLE IF NOT EXISTS judge_efficiency (
  id SERIAL PRIMARY KEY,
  judge_name TEXT NOT NULL,
  court_name TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT 2024,
  source_file TEXT,
  -- Workload (cases per judge / court avg / region avg)
  workload_criminal_judge NUMERIC,
  workload_criminal_court NUMERIC,
  workload_criminal_region NUMERIC,
  workload_civil_judge NUMERIC,
  workload_civil_court NUMERIC,
  workload_civil_region NUMERIC,
  workload_admin_judge NUMERIC,
  workload_admin_court NUMERIC,
  workload_admin_region NUMERIC,
  workload_commercial_judge NUMERIC,
  workload_commercial_court NUMERIC,
  workload_commercial_region NUMERIC,
  workload_misdemeanor_judge NUMERIC,
  workload_misdemeanor_court NUMERIC,
  workload_misdemeanor_region NUMERIC,
  -- Overturned decisions
  overturned_criminal_total INTEGER,
  overturned_civil_total INTEGER,
  overturned_admin_total INTEGER,
  overturned_commercial_total INTEGER,
  overturned_misdemeanor_total INTEGER,
  -- Deadline violations
  deadline_violations_criminal INTEGER,
  deadline_violations_civil INTEGER,
  deadline_violations_admin INTEGER,
  deadline_violations_commercial INTEGER,
  deadline_violations_misdemeanor INTEGER,
  --
  source_date DATE DEFAULT '2024-12-31',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(judge_name, court_name, year)
);

CREATE INDEX IF NOT EXISTS idx_je_judge ON judge_efficiency(judge_name);
CREATE INDEX IF NOT EXISTS idx_je_court ON judge_efficiency(court_name);
CREATE INDEX IF NOT EXISTS idx_je_year ON judge_efficiency(year);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_judge_efficiency_updated_at') THEN
        CREATE TRIGGER update_judge_efficiency_updated_at BEFORE UPDATE ON judge_efficiency
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
