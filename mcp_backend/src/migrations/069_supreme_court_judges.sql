-- Supreme Court judges reference table
-- Source: https://court.gov.ua/storage/portal/supreme/vidkr_dany/21_10_2024_suddi_VS.xlsx

CREATE TABLE IF NOT EXISTS supreme_court_judges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  surname VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  patronymic VARCHAR(100),
  position TEXT NOT NULL,
  court VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  source_date DATE DEFAULT '2024-10-21',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scj_surname ON supreme_court_judges(surname);
CREATE INDEX IF NOT EXISTS idx_scj_court ON supreme_court_judges(court);
CREATE INDEX IF NOT EXISTS idx_scj_active ON supreme_court_judges(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scj_fullname_court ON supreme_court_judges(full_name, court);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_supreme_court_judges_updated_at') THEN
        CREATE TRIGGER update_supreme_court_judges_updated_at BEFORE UPDATE ON supreme_court_judges
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
