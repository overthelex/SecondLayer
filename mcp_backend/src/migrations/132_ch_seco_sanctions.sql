-- Migration 132: CH SECO sanctions list (SESAM XML)
-- Source: sesam.search.admin.ch - 8307 targets across 30 sanctions programmes

CREATE TABLE IF NOT EXISTS ch_seco_sanctions (
    ssid               BIGINT PRIMARY KEY,
    sanctions_set_id   BIGINT,
    target_type        TEXT NOT NULL,
    primary_name       TEXT NOT NULL,
    aliases            JSONB,
    dob                TEXT,
    pob                TEXT,
    nationality        TEXT[],
    addresses          JSONB,
    identification     JSONB,
    programme          TEXT,
    origin             TEXT,
    legal_basis        TEXT,
    justification      TEXT,
    other_information  TEXT,
    listed_at          DATE,
    delisted_at        DATE,
    source_xml_date    DATE,
    metadata_json      JSONB,
    imported_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ch_seco_target_type ON ch_seco_sanctions(target_type);
CREATE INDEX IF NOT EXISTS idx_ch_seco_programme ON ch_seco_sanctions(programme);
CREATE INDEX IF NOT EXISTS idx_ch_seco_origin ON ch_seco_sanctions(origin);
CREATE INDEX IF NOT EXISTS idx_ch_seco_listed ON ch_seco_sanctions(listed_at);
CREATE INDEX IF NOT EXISTS idx_ch_seco_active ON ch_seco_sanctions(programme, origin) WHERE delisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ch_seco_aliases_gin ON ch_seco_sanctions USING GIN (aliases jsonb_path_ops);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ch_seco_fts') THEN
        CREATE INDEX idx_ch_seco_fts ON ch_seco_sanctions
            USING GIN (to_tsvector('simple', coalesce(primary_name, '') || ' ' || coalesce(other_information, '')));
    END IF;
END $$;
