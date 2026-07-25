-- Migration 123: EU common open data — legislation, court cases, sanctions
-- Sources: EUR-Lex (CELLAR), CURIA (CJEU), HUDOC (ECHR), EU Sanctions

-- ═══════════════════════════════════════════════════════════════
-- 1. EUR-Lex Legislation (regulations, directives, decisions)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS eu_eurlex_legislation (
    celex TEXT PRIMARY KEY,
    title TEXT,
    title_en TEXT,
    doc_type TEXT,                     -- REG, DIR, DEC, RECO, etc.
    doc_number TEXT,                   -- e.g. "2016/679" for GDPR
    doc_date DATE,
    date_document DATE,
    date_entry_into_force DATE,
    date_end_validity DATE,
    in_force BOOLEAN DEFAULT TRUE,
    eli TEXT,                          -- European Legislation Identifier
    cellar_uri TEXT,
    author TEXT,                       -- issuing institution
    subject_matter TEXT[],             -- eurovoc descriptors
    directory_codes TEXT[],            -- EUR-Lex directory classification
    full_text TEXT,
    full_text_html TEXT,
    languages_available TEXT[],
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eu_eurlex_type ON eu_eurlex_legislation(doc_type);
CREATE INDEX IF NOT EXISTS idx_eu_eurlex_date ON eu_eurlex_legislation(doc_date);
CREATE INDEX IF NOT EXISTS idx_eu_eurlex_force ON eu_eurlex_legislation(in_force);
CREATE INDEX IF NOT EXISTS idx_eu_eurlex_number ON eu_eurlex_legislation(doc_number);
CREATE INDEX IF NOT EXISTS idx_eu_eurlex_eli ON eu_eurlex_legislation(eli);

-- FTS index (English + generic)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_eu_eurlex_fts') THEN
        CREATE INDEX idx_eu_eurlex_fts ON eu_eurlex_legislation
            USING GIN (to_tsvector('english', coalesce(title_en, '') || ' ' || coalesce(full_text, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. CURIA — Court of Justice of the EU (CJEU + General Court)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS eu_curia_cases (
    ecli TEXT PRIMARY KEY,             -- ECLI identifier
    case_number TEXT NOT NULL,         -- e.g. "C-131/12"
    case_name TEXT,
    court TEXT,                        -- CJ (Court of Justice) / GC (General Court)
    chamber TEXT,
    decision_type TEXT,                -- judgment, opinion, order
    decision_date DATE,
    subject_matter TEXT[],
    parties TEXT,
    advocate_general TEXT,
    judge_rapporteur TEXT,
    procedure_type TEXT,               -- preliminary ruling, direct action, appeal
    celex_links TEXT[],                -- related EUR-Lex documents
    full_text TEXT,
    full_text_html TEXT,
    languages_available TEXT[],
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eu_curia_case ON eu_curia_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_eu_curia_court ON eu_curia_cases(court);
CREATE INDEX IF NOT EXISTS idx_eu_curia_date ON eu_curia_cases(decision_date);
CREATE INDEX IF NOT EXISTS idx_eu_curia_type ON eu_curia_cases(decision_type);
CREATE INDEX IF NOT EXISTS idx_eu_curia_procedure ON eu_curia_cases(procedure_type);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_eu_curia_fts') THEN
        CREATE INDEX idx_eu_curia_fts ON eu_curia_cases
            USING GIN (to_tsvector('english', coalesce(case_name, '') || ' ' || coalesce(full_text, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. ECHR / HUDOC — European Court of Human Rights
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS eu_echr_cases (
    ecli TEXT PRIMARY KEY,
    app_number TEXT,                   -- application number (e.g. "21906/04")
    case_title TEXT NOT NULL,
    importance_level TEXT,             -- 1 (key), 2 (high), 3 (medium), 4 (low)
    judgment_date DATE,
    conclusion TEXT,                   -- violation / no violation / struck out
    respondent_state TEXT,             -- country code
    articles TEXT[],                   -- Convention articles (e.g. ["Art. 6", "Art. 8"])
    chamber TEXT,
    separate_opinions BOOLEAN DEFAULT FALSE,
    full_text TEXT,
    full_text_html TEXT,
    languages_available TEXT[],
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eu_echr_app ON eu_echr_cases(app_number);
CREATE INDEX IF NOT EXISTS idx_eu_echr_date ON eu_echr_cases(judgment_date);
CREATE INDEX IF NOT EXISTS idx_eu_echr_state ON eu_echr_cases(respondent_state);
CREATE INDEX IF NOT EXISTS idx_eu_echr_importance ON eu_echr_cases(importance_level);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_eu_echr_fts') THEN
        CREATE INDEX idx_eu_echr_fts ON eu_echr_cases
            USING GIN (to_tsvector('english', coalesce(case_title, '') || ' ' || coalesce(full_text, '')));
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4. EU Sanctions (Consolidated list)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS eu_sanctions (
    entity_id TEXT PRIMARY KEY,        -- EU reference number
    entity_type TEXT NOT NULL,          -- person / entity
    name TEXT NOT NULL,
    name_aliases TEXT[],
    birth_date TEXT,
    birth_place TEXT,
    citizenship TEXT[],
    addresses TEXT[],
    identifications JSONB,             -- passport numbers, etc.
    regulation_basis TEXT,              -- legal basis (regulation CELEX)
    listing_date DATE,
    programme TEXT,                     -- sanctions programme name
    remark TEXT,
    metadata_json JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eu_sanctions_type ON eu_sanctions(entity_type);
CREATE INDEX IF NOT EXISTS idx_eu_sanctions_programme ON eu_sanctions(programme);
CREATE INDEX IF NOT EXISTS idx_eu_sanctions_date ON eu_sanctions(listing_date);

-- FTS on name only (name_aliases stored as array, not suitable for expression index)
CREATE INDEX IF NOT EXISTS idx_eu_sanctions_fts ON eu_sanctions
    USING GIN (to_tsvector('simple', coalesce(name, '')));
