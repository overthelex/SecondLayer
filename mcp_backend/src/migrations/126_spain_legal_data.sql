-- Migration 121: Spanish legal open data — align existing tables + add missing columns/indexes
-- Tables already exist from prior schema; this migration adds missing columns and FTS indexes.

-- ═══════════════════════════════════════════════════════════════
-- 1. BOE — add missing columns (full_text_xml, analysis_json, url_html_consolidada)
-- Existing schema uses: id (serial), boe_id, title, metadata (jsonb)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE spain_boe_legislation ADD COLUMN IF NOT EXISTS full_text_xml TEXT;
ALTER TABLE spain_boe_legislation ADD COLUMN IF NOT EXISTS analysis_json JSONB;
ALTER TABLE spain_boe_legislation ADD COLUMN IF NOT EXISTS url_html_consolidada TEXT;
ALTER TABLE spain_boe_legislation ADD COLUMN IF NOT EXISTS diario TEXT;
ALTER TABLE spain_boe_legislation ADD COLUMN IF NOT EXISTS diario_numero TEXT;
ALTER TABLE spain_boe_legislation ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_spain_boe_rango ON spain_boe_legislation(rango);
CREATE INDEX IF NOT EXISTS idx_spain_boe_fecha_pub ON spain_boe_legislation(fecha_publicacion);
CREATE INDEX IF NOT EXISTS idx_spain_boe_estado ON spain_boe_legislation(estado_consolidacion);
CREATE INDEX IF NOT EXISTS idx_spain_boe_ambito ON spain_boe_legislation(ambito);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spain_boe_boe_id ON spain_boe_legislation(boe_id);

-- ═══════════════════════════════════════════════════════════════
-- 2. EUR-Lex — already matches, ensure indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_eurlex_type ON spain_eurlex_legislation(doc_type);
CREATE INDEX IF NOT EXISTS idx_spain_eurlex_date ON spain_eurlex_legislation(doc_date);
CREATE INDEX IF NOT EXISTS idx_spain_eurlex_force ON spain_eurlex_legislation(in_force);

-- ═══════════════════════════════════════════════════════════════
-- 3. Tribunal Constitucional — actual columns are tipo/fecha (not tipo_resolucion/fecha_registro)
-- Indexes idx_tc_tipo and idx_tc_fecha already exist; create idempotent aliases.
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_tc_tipo ON spain_tribunal_constitucional(tipo);
CREATE INDEX IF NOT EXISTS idx_spain_tc_fecha ON spain_tribunal_constitucional(fecha);

-- ═══════════════════════════════════════════════════════════════
-- 4. BORME Section C — already matches, ensure indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_borme_fecha ON spain_borme_section_c(fecha_publicacion);
CREATE INDEX IF NOT EXISTS idx_spain_borme_tipo ON spain_borme_section_c(tipo_anuncio);

-- ═══════════════════════════════════════════════════════════════
-- 5. Consejo de Estado — already matches, ensure indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_ce_fecha ON spain_consejo_estado(fecha_aprobacion);
CREATE INDEX IF NOT EXISTS idx_spain_ce_procedencia ON spain_consejo_estado(procedencia);

-- ═══════════════════════════════════════════════════════════════
-- 6. AEAT — already matches, ensure indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_aeat_fecha ON spain_aeat_consultas(fecha);
CREATE INDEX IF NOT EXISTS idx_spain_aeat_impuesto ON spain_aeat_consultas(impuesto);

-- ═══════════════════════════════════════════════════════════════
-- 7. Fiscalía — already matches, ensure indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_fiscalia_tipo ON spain_fiscalia(tipo);
CREATE INDEX IF NOT EXISTS idx_spain_fiscalia_fecha ON spain_fiscalia(fecha);

-- ═══════════════════════════════════════════════════════════════
-- Full-text search indexes (tsvector, Spanish config)
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spain_boe_fts ON spain_boe_legislation
    USING gin(to_tsvector('spanish', COALESCE(title, '') || ' ' || COALESCE(full_text, '')));

CREATE INDEX IF NOT EXISTS idx_spain_eurlex_fts ON spain_eurlex_legislation
    USING gin(to_tsvector('spanish', COALESCE(title, '') || ' ' || COALESCE(full_text, '')));

CREATE INDEX IF NOT EXISTS idx_spain_tc_fts ON spain_tribunal_constitucional
    USING gin(to_tsvector('spanish', COALESCE(full_text, '')));

CREATE INDEX IF NOT EXISTS idx_spain_ce_fts ON spain_consejo_estado
    USING gin(to_tsvector('spanish', COALESCE(full_text, '')));

CREATE INDEX IF NOT EXISTS idx_spain_aeat_fts ON spain_aeat_consultas
    USING gin(to_tsvector('spanish', COALESCE(cuestion, '') || ' ' || COALESCE(contestacion, '')));

CREATE INDEX IF NOT EXISTS idx_spain_fiscalia_fts ON spain_fiscalia
    USING gin(to_tsvector('spanish', COALESCE(titulo, '') || ' ' || COALESCE(full_text, '')));
