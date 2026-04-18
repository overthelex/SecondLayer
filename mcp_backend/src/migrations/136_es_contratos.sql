-- Migration 136: ES Plataforma de Contratación del Sector Público (~5-8M tenders)
-- Source: contrataciondelestado.es atom feeds (CODICE XML, UBL-derived)

CREATE TABLE IF NOT EXISTS spain_contratos (
    contract_id         TEXT PRIMARY KEY,
    title               TEXT,
    summary             TEXT,
    link                TEXT,
    atom_source         TEXT,                       -- federal / ccaa / local
    contracting_body    TEXT,
    contractor_name     TEXT,
    contractor_nif      TEXT,
    procedure_type      TEXT,
    contract_type       TEXT,
    status              TEXT,
    amount              NUMERIC(20,2),
    currency            TEXT DEFAULT 'EUR',
    issue_date          DATE,
    deadline_date       DATE,
    award_date          DATE,
    raw_xml             TEXT,
    metadata_json       JSONB,
    imported_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_es_contratos_issue ON spain_contratos(issue_date);
CREATE INDEX IF NOT EXISTS idx_es_contratos_award ON spain_contratos(award_date);
CREATE INDEX IF NOT EXISTS idx_es_contratos_status ON spain_contratos(status);
CREATE INDEX IF NOT EXISTS idx_es_contratos_nif ON spain_contratos(contractor_nif);
CREATE INDEX IF NOT EXISTS idx_es_contratos_source ON spain_contratos(atom_source);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_es_contratos_fts') THEN
        CREATE INDEX idx_es_contratos_fts ON spain_contratos
            USING GIN (to_tsvector('spanish',
                COALESCE(title, '') || ' ' ||
                COALESCE(summary, '') || ' ' ||
                COALESCE(contracting_body, '') || ' ' ||
                COALESCE(contractor_name, '')));
    END IF;
END $$;
