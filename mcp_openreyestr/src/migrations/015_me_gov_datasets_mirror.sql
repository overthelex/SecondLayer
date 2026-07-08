-- 015_me_gov_datasets_mirror.sql
-- Generic mirror of ALL open datasets published by the Ministry of Economy of Ukraine
-- (Міністерство економіки України) on data.gov.ua.
--
-- Org (CKAN): ministerstvo-ekonomichnoho-rozvytku-i-torhivli-ukrayiny
--            id c9edbe3d-0a05-4d00-b23b-7c1fe5810ca4  (69 datasets as of 2025-02)
--
-- Because the 69 datasets are wildly heterogeneous (IP registers, agri registers,
-- financials, quotas, trade data, ...) we do NOT model 69 bespoke schemas. Instead
-- this is a 3-table generic CKAN mirror:
--   me_datasets   -- one row per CKAN package (dataset metadata)
--   me_resources  -- one row per file/resource inside a dataset
--   me_records    -- generic per-row storage for tabular resources (JSONB)
-- Non-tabular resources (PDF/DOC/ZIP) are mirrored as files (local_path) with no rows.
--
-- Populated by scripts/opendata/me-gov-ua/me_datagov_pipeline.py
--   (discover -> download -> import -> verify), run local -> prod over WG.
--
-- Idempotent: safe to re-run (CREATE ... IF NOT EXISTS, ON CONFLICT upserts in loader).

-- ── Datasets (CKAN packages) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_datasets (
    id                     BIGSERIAL PRIMARY KEY,
    ckan_id                TEXT UNIQUE NOT NULL,          -- CKAN package id (UUID) or slug
    slug                   TEXT,                          -- CKAN package "name"
    title                  TEXT NOT NULL,                 -- CKAN package "title"
    notes                  TEXT,                          -- description
    org_id                 TEXT,
    org_title              TEXT DEFAULT 'Міністерство економіки України',
    tags                   TEXT[] DEFAULT '{}',
    num_resources          INTEGER DEFAULT 0,             -- resource count reported by CKAN
    ckan_metadata_created  TIMESTAMPTZ,
    ckan_metadata_modified TIMESTAMPTZ,
    raw                    JSONB,                         -- full package_show result (provenance)
    mirrored_at            TIMESTAMPTZ DEFAULT NOW(),      -- first time we saw it
    updated_at             TIMESTAMPTZ DEFAULT NOW()       -- last discover touch
);

CREATE INDEX IF NOT EXISTS idx_me_datasets_slug ON me_datasets(slug);
CREATE INDEX IF NOT EXISTS idx_me_datasets_tags ON me_datasets USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_me_datasets_fts
    ON me_datasets USING gin(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(notes, '')));

-- ── Resources (files inside a dataset) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_resources (
    id                  BIGSERIAL PRIMARY KEY,
    dataset_id          BIGINT NOT NULL REFERENCES me_datasets(id) ON DELETE CASCADE,
    ckan_resource_id    TEXT UNIQUE NOT NULL,             -- CKAN resource id (UUID)
    name                TEXT,
    format              TEXT,                             -- CSV / XLSX / XML / JSON / PDF / ...
    url                 TEXT NOT NULL,                    -- download URL
    mimetype            TEXT,
    size_bytes          BIGINT,
    ckan_created        TIMESTAMPTZ,
    ckan_last_modified  TIMESTAMPTZ,
    -- local mirror / import bookkeeping
    local_path          TEXT,                             -- staging path after download
    sha256              TEXT,
    downloaded_at       TIMESTAMPTZ,
    row_count           INTEGER,                          -- rows imported into me_records
    import_status       TEXT DEFAULT 'pending',           -- pending|downloaded|imported|skipped|error
    import_error        TEXT,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_resources_dataset  ON me_resources(dataset_id);
CREATE INDEX IF NOT EXISTS idx_me_resources_format   ON me_resources(format);
CREATE INDEX IF NOT EXISTS idx_me_resources_status   ON me_resources(import_status);

-- ── Records (generic per-row storage for tabular resources) ─────────────────
CREATE TABLE IF NOT EXISTS me_records (
    id           BIGSERIAL PRIMARY KEY,
    resource_id  BIGINT NOT NULL REFERENCES me_resources(id) ON DELETE CASCADE,
    row_index    INTEGER NOT NULL,
    data         JSONB NOT NULL,
    UNIQUE (resource_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_me_records_resource ON me_records(resource_id);
CREATE INDEX IF NOT EXISTS idx_me_records_data     ON me_records USING gin(data jsonb_path_ops);
