-- Migration 067: ERAU lawyers cache table
-- Caches results from the Ukrainian Bar Registry (ЄРАУ) to reduce external API calls
-- and provide fallback when the external service is unavailable.

CREATE TABLE IF NOT EXISTS erau_lawyers (
  id SERIAL PRIMARY KEY,
  erau_id INTEGER NOT NULL,
  surname VARCHAR(255) NOT NULL,
  firstname VARCHAR(255) NOT NULL,
  middlename VARCHAR(255),
  racalc VARCHAR(255),
  certnum VARCHAR(100),
  certat VARCHAR(100),
  certcalc VARCHAR(255),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_erau_lawyers_erau_id UNIQUE (erau_id)
);

CREATE INDEX IF NOT EXISTS idx_erau_lawyers_surname ON erau_lawyers (LOWER(surname));
CREATE INDEX IF NOT EXISTS idx_erau_lawyers_certnum ON erau_lawyers (certnum);
