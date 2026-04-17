-- Migration 122: Spanish criminal court decisions from CENDOJ
-- Tribunal Supremo (Sala Penal) + Audiencia Nacional (Sala Penal) decisions

CREATE TABLE IF NOT EXISTS spain_cendoj_penal (
    id SERIAL PRIMARY KEY,
    roj TEXT NOT NULL,
    ecli TEXT,
    tribunal TEXT,
    sala TEXT,
    ponente TEXT,
    fecha_resolucion DATE,
    fecha_publicacion DATE,
    tipo_resolucion TEXT,
    numero_resolucion TEXT,
    numero_recurso TEXT,
    resumen TEXT,
    full_text TEXT,
    reference_id TEXT,
    document_hash TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_spain_cendoj_roj UNIQUE (roj)
);

CREATE INDEX IF NOT EXISTS idx_spain_cendoj_fecha ON spain_cendoj_penal(fecha_resolucion);
CREATE INDEX IF NOT EXISTS idx_spain_cendoj_tribunal ON spain_cendoj_penal(tribunal);
CREATE INDEX IF NOT EXISTS idx_spain_cendoj_ecli ON spain_cendoj_penal(ecli);
CREATE INDEX IF NOT EXISTS idx_spain_cendoj_tipo ON spain_cendoj_penal(tipo_resolucion);
CREATE INDEX IF NOT EXISTS idx_spain_cendoj_fts ON spain_cendoj_penal
    USING gin(to_tsvector('spanish', COALESCE(full_text, '')));
