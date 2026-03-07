-- OpenSanctions full database (all 346 datasets merged via 'default' collection)
-- Source: https://www.opensanctions.org/datasets/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS opensanctions_entities (
  id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,              -- Person, Company, Organization, LegalEntity, Vessel, Aircraft, etc.
  name TEXT NOT NULL,
  aliases TEXT,                      -- semicolon-separated
  birth_date TEXT,
  countries TEXT,                    -- semicolon-separated country codes
  addresses TEXT,                    -- semicolon-separated
  identifiers TEXT,                  -- semicolon-separated (INN, OGRN, passport, etc.)
  sanctions TEXT,                    -- semicolon-separated sanction programs
  phones TEXT,
  emails TEXT,
  program_ids TEXT,                  -- semicolon-separated program IDs
  datasets TEXT,                     -- semicolon-separated source dataset names
  first_seen TIMESTAMP WITH TIME ZONE,
  last_seen TIMESTAMP WITH TIME ZONE,
  last_change TIMESTAMP WITH TIME ZONE,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for search
CREATE INDEX IF NOT EXISTS idx_opensanctions_schema ON opensanctions_entities (schema);
CREATE INDEX IF NOT EXISTS idx_opensanctions_name_trgm ON opensanctions_entities USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_opensanctions_first_seen ON opensanctions_entities (first_seen);
CREATE INDEX IF NOT EXISTS idx_opensanctions_last_seen ON opensanctions_entities (last_seen);
CREATE INDEX IF NOT EXISTS idx_opensanctions_datasets ON opensanctions_entities USING gin (datasets gin_trgm_ops);
