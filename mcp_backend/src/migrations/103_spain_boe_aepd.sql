-- Migration 103: Spanish legal data — BOE (legislation) + AEPD (GDPR decisions)
-- Idempotent: safe to re-run

-- BOE consolidated legislation
CREATE TABLE IF NOT EXISTS spain_boe_legislation (
    id SERIAL PRIMARY KEY,
    boe_id VARCHAR(50) NOT NULL,          -- e.g. BOE-A-2018-13593
    title TEXT NOT NULL,
    rango VARCHAR(100),                    -- Ley, Real Decreto, etc.
    departamento TEXT,
    ambito VARCHAR(50),                    -- Estatal, Autonomico
    fecha_disposicion DATE,
    fecha_publicacion DATE,
    fecha_vigencia DATE,
    numero_oficial VARCHAR(100),
    estado_consolidacion VARCHAR(50),
    vigencia_agotada BOOLEAN DEFAULT FALSE,
    estatus_derogacion VARCHAR(50),
    url_eli TEXT,
    url_html TEXT,
    url_pdf TEXT,
    full_text TEXT,                         -- consolidated full text
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spain_boe_boe_id ON spain_boe_legislation(boe_id);
CREATE INDEX IF NOT EXISTS idx_spain_boe_rango ON spain_boe_legislation(rango);
CREATE INDEX IF NOT EXISTS idx_spain_boe_fecha ON spain_boe_legislation(fecha_publicacion);
CREATE INDEX IF NOT EXISTS idx_spain_boe_title_fts ON spain_boe_legislation USING gin(to_tsvector('spanish', title));
CREATE INDEX IF NOT EXISTS idx_spain_boe_fulltext_fts ON spain_boe_legislation USING gin(to_tsvector('spanish', COALESCE(full_text, '')));

-- AEPD resolutions (GDPR decisions)
CREATE TABLE IF NOT EXISTS spain_aepd_resolutions (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(100) NOT NULL,       -- e.g. PS-00211-2025
    expediente VARCHAR(100),               -- e.g. EXP202514775
    fecha_firma DATE,
    titulo TEXT,
    extracto TEXT,                          -- excerpt from listing
    tipo_procedimiento VARCHAR(100),       -- procedure type
    conceptos TEXT[],                       -- categories/concepts
    sectorial VARCHAR(100),
    articulos_infringidos TEXT[],
    ley_tipificacion VARCHAR(200),
    pdf_url TEXT,
    pdf_text TEXT,                          -- extracted PDF text
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spain_aepd_reference ON spain_aepd_resolutions(reference);
CREATE INDEX IF NOT EXISTS idx_spain_aepd_fecha ON spain_aepd_resolutions(fecha_firma);
CREATE INDEX IF NOT EXISTS idx_spain_aepd_tipo ON spain_aepd_resolutions(tipo_procedimiento);
CREATE INDEX IF NOT EXISTS idx_spain_aepd_extracto_fts ON spain_aepd_resolutions USING gin(to_tsvector('spanish', COALESCE(extracto, '')));
CREATE INDEX IF NOT EXISTS idx_spain_aepd_fulltext_fts ON spain_aepd_resolutions USING gin(to_tsvector('spanish', COALESCE(pdf_text, '')));
