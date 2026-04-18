-- Migration 138: ES Congreso de los Diputados + Senado (~25M voting rows)
-- Source: congreso.es/es/opendata + senado.es (XML ISO-8859-1)

CREATE TABLE IF NOT EXISTS spain_diputados (
    diputado_id         TEXT PRIMARY KEY,
    nombre              TEXT,
    apellidos           TEXT,
    grupo               TEXT,
    circunscripcion     TEXT,
    legislatura         INTEGER,
    asiento             TEXT,
    fecha_alta          DATE,
    fecha_baja          DATE,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_diput_legis ON spain_diputados(legislatura);
CREATE INDEX IF NOT EXISTS idx_es_diput_grupo ON spain_diputados(grupo);

CREATE TABLE IF NOT EXISTS spain_congreso_bills (
    bill_id             TEXT PRIMARY KEY,           -- expediente number
    legislatura         INTEGER,
    tipo                TEXT,                        -- proyecto/proposicion de ley
    titulo              TEXT,
    autor               TEXT,
    fecha_presentacion  DATE,
    estado              TEXT,
    fecha_estado        DATE,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_bills_legis ON spain_congreso_bills(legislatura);
CREATE INDEX IF NOT EXISTS idx_es_bills_estado ON spain_congreso_bills(estado);

CREATE TABLE IF NOT EXISTS spain_congreso_voting (
    legislatura         INTEGER NOT NULL,
    sesion              INTEGER NOT NULL,
    votacion_num        INTEGER NOT NULL,
    fecha               DATE,
    titulo              TEXT,
    texto_expediente    TEXT,
    presentes           INTEGER,
    a_favor             INTEGER,
    en_contra           INTEGER,
    abstenciones        INTEGER,
    no_votan            INTEGER,
    asiento             TEXT NOT NULL,              -- per-MP seat
    diputado            TEXT,
    grupo               TEXT,
    voto                TEXT,                        -- Si/No/Abstencion/NoVota
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (legislatura, sesion, votacion_num, asiento)
);
CREATE INDEX IF NOT EXISTS idx_es_vote_fecha ON spain_congreso_voting(fecha);
CREATE INDEX IF NOT EXISTS idx_es_vote_diputado ON spain_congreso_voting(diputado);
CREATE INDEX IF NOT EXISTS idx_es_vote_grupo ON spain_congreso_voting(grupo);
CREATE INDEX IF NOT EXISTS idx_es_vote_voto ON spain_congreso_voting(voto);

CREATE TABLE IF NOT EXISTS spain_senadores (
    senador_id          TEXT PRIMARY KEY,
    nombre              TEXT,
    apellidos           TEXT,
    grupo               TEXT,
    circunscripcion     TEXT,
    legislatura         INTEGER,
    fecha_alta          DATE,
    fecha_baja          DATE,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_sen_legis ON spain_senadores(legislatura);

CREATE TABLE IF NOT EXISTS spain_senado_voting (
    legislatura         INTEGER NOT NULL,
    sesion              INTEGER NOT NULL,
    votacion_num        INTEGER NOT NULL,
    fecha               DATE,
    titulo              TEXT,
    presentes           INTEGER,
    a_favor             INTEGER,
    en_contra           INTEGER,
    abstenciones        INTEGER,
    senador_id          TEXT NOT NULL,
    senador_nombre      TEXT,
    grupo               TEXT,
    voto                TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (legislatura, sesion, votacion_num, senador_id)
);
CREATE INDEX IF NOT EXISTS idx_es_sen_vote_fecha ON spain_senado_voting(fecha);
CREATE INDEX IF NOT EXISTS idx_es_sen_vote_grupo ON spain_senado_voting(grupo);
