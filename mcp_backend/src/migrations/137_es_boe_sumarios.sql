-- Migration 137: ES BOE sumarios — 5 sections (~5M total actos since 1960)
-- Source: boe.es/datosabiertos/api/boe/sumario/YYYYMMDD (public domain)

-- Common columns shared by Section I+III, V, II, IV
CREATE TABLE IF NOT EXISTS spain_boe_disposiciones (
    boe_id              TEXT PRIMARY KEY,           -- BOE-A-YYYY-N
    fecha               DATE NOT NULL,
    seccion             TEXT,                        -- 1 or 3
    departamento        TEXT,
    rango               TEXT,                        -- LEY, RD, RDL, ORDEN, etc.
    titulo              TEXT,
    url_pdf             TEXT,
    url_xml             TEXT,
    url_html            TEXT,
    full_text           TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_disp_fecha ON spain_boe_disposiciones(fecha);
CREATE INDEX IF NOT EXISTS idx_es_disp_seccion ON spain_boe_disposiciones(seccion);
CREATE INDEX IF NOT EXISTS idx_es_disp_rango ON spain_boe_disposiciones(rango);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_es_disp_fts') THEN
        CREATE INDEX idx_es_disp_fts ON spain_boe_disposiciones
            USING GIN (to_tsvector('spanish', COALESCE(titulo, '') || ' ' || COALESCE(full_text, '')));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS spain_boe_anuncios (
    boe_id              TEXT PRIMARY KEY,           -- BOE-B-YYYY-N
    fecha               DATE NOT NULL,
    seccion             TEXT,                        -- V.A or V.B
    departamento        TEXT,
    titulo              TEXT,
    url_pdf             TEXT,
    url_xml             TEXT,
    full_text           TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_anun_fecha ON spain_boe_anuncios(fecha);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_es_anun_fts') THEN
        CREATE INDEX idx_es_anun_fts ON spain_boe_anuncios
            USING GIN (to_tsvector('spanish', COALESCE(titulo, '') || ' ' || COALESCE(full_text, '')));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS spain_boe_personal (
    boe_id              TEXT PRIMARY KEY,
    fecha               DATE NOT NULL,
    seccion             TEXT,                        -- II.A or II.B
    departamento        TEXT,
    titulo              TEXT,
    url_pdf             TEXT,
    full_text           TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_personal_fecha ON spain_boe_personal(fecha);

CREATE TABLE IF NOT EXISTS spain_boe_justicia (
    boe_id              TEXT PRIMARY KEY,
    fecha               DATE NOT NULL,
    departamento        TEXT,
    titulo              TEXT,
    url_pdf             TEXT,
    full_text           TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_justicia_fecha ON spain_boe_justicia(fecha);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_es_justicia_fts') THEN
        CREATE INDEX idx_es_justicia_fts ON spain_boe_justicia
            USING GIN (to_tsvector('spanish', COALESCE(titulo, '') || ' ' || COALESCE(full_text, '')));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS spain_borme_sumarios (
    borme_id            TEXT PRIMARY KEY,           -- BORME-A/B/C-YYYY-N-PP
    fecha               DATE NOT NULL,
    seccion             TEXT,                        -- A/B/C
    provincia           TEXT,
    titulo              TEXT,
    url_pdf             TEXT,
    url_xml             TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_borme_fecha ON spain_borme_sumarios(fecha);
CREATE INDEX IF NOT EXISTS idx_es_borme_seccion ON spain_borme_sumarios(seccion);
CREATE INDEX IF NOT EXISTS idx_es_borme_provincia ON spain_borme_sumarios(provincia);
