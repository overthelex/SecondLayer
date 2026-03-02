-- Current judges registry from VKKSU open data
-- Source: https://data.gov.ua/dataset/354d406b-53cc-4788-a384-78b9abaf2ea0
-- Data as of: 2026-02-23
-- Table already exists from earlier migration; this ensures indexes and trigger

CREATE TABLE IF NOT EXISTS judges_current (
  id SERIAL PRIMARY KEY,
  dossier_number VARCHAR(50),
  full_name VARCHAR(500) NOT NULL,
  gender VARCHAR(10),
  court_name VARCHAR(500),
  first_seen DATE,
  last_seen DATE,
  snapshot_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(full_name, court_name)
);

CREATE INDEX IF NOT EXISTS idx_jc_court ON judges_current(court_name);
CREATE INDEX IF NOT EXISTS idx_jc_dossier ON judges_current(dossier_number);
CREATE INDEX IF NOT EXISTS idx_jc_fullname ON judges_current(full_name);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_judges_current_updated_at') THEN
        CREATE TRIGGER update_judges_current_updated_at BEFORE UPDATE ON judges_current
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
