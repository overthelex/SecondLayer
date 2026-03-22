-- Migration 012: Street renamings from OpenStreetMap
-- Source: Overpass API, streets with old_name tag in Ukraine

CREATE TABLE IF NOT EXISTS street_renamings (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT NOT NULL,
    current_name TEXT NOT NULL,
    current_name_uk TEXT,
    old_names TEXT[] NOT NULL,
    rename_count INTEGER NOT NULL DEFAULT 1,
    data_source TEXT DEFAULT 'OpenStreetMap',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_street_renamings_osm_id ON street_renamings(osm_id);
CREATE INDEX IF NOT EXISTS idx_street_renamings_current_name_fts ON street_renamings USING gin(to_tsvector('simple', current_name));
CREATE INDEX IF NOT EXISTS idx_street_renamings_old_names_fts ON street_renamings USING gin(to_tsvector('simple', array_to_string(old_names, ' ')));
CREATE INDEX IF NOT EXISTS idx_street_renamings_rename_count ON street_renamings(rename_count DESC);
