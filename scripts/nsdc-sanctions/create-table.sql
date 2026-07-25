-- NSDC Sanctions Registry subjects
-- Source: https://drs.nsdc.gov.ua / OpenSanctions mirror

CREATE TABLE IF NOT EXISTS nsdc_sanctions_subjects (
  id TEXT PRIMARY KEY,                    -- OpenSanctions entity ID (e.g. NK-223yQP...)
  caption TEXT NOT NULL,                  -- Display name
  schema TEXT NOT NULL,                   -- Entity type: Person / Organization / ...
  names TEXT[] DEFAULT '{}',              -- All name variants
  aliases TEXT[] DEFAULT '{}',            -- Aliases / transliterations
  birth_dates TEXT[] DEFAULT '{}',        -- Birth dates (persons)
  death_date TEXT,                        -- Death date
  citizenships TEXT[] DEFAULT '{}',       -- Country codes
  countries TEXT[] DEFAULT '{}',          -- Related countries
  addresses TEXT[] DEFAULT '{}',         -- Known addresses
  identifiers JSONB DEFAULT '[]',        -- [{type, value}] — INN, OGRN, passport etc.
  sanctions JSONB DEFAULT '[]',          -- Sanctions details [{decree, status, start, end, provisions}]
  sanctions_status TEXT,                 -- Derived: 'active' / 'expired' / 'excluded'
  program_ids TEXT[] DEFAULT '{}',       -- Sanction program IDs
  phones TEXT[] DEFAULT '{}',
  emails TEXT[] DEFAULT '{}',
  properties JSONB DEFAULT '{}',         -- Full properties blob
  first_seen TIMESTAMP WITH TIME ZONE,
  last_seen TIMESTAMP WITH TIME ZONE,
  last_change TIMESTAMP WITH TIME ZONE,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nsdc_sanctions_schema ON nsdc_sanctions_subjects (schema);
CREATE INDEX IF NOT EXISTS idx_nsdc_sanctions_status ON nsdc_sanctions_subjects (sanctions_status);
CREATE INDEX IF NOT EXISTS idx_nsdc_sanctions_first_seen ON nsdc_sanctions_subjects (first_seen);
CREATE INDEX IF NOT EXISTS idx_nsdc_sanctions_caption_trgm ON nsdc_sanctions_subjects USING gin (caption gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nsdc_sanctions_names ON nsdc_sanctions_subjects USING gin (names);
CREATE INDEX IF NOT EXISTS idx_nsdc_sanctions_identifiers ON nsdc_sanctions_subjects USING gin (identifiers jsonb_path_ops);
