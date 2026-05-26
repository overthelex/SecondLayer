-- Migration 156: Summary table with full-text court decision counts per jurisdiction
-- Maintained automatically via triggers on all court decision tables
-- Uses delta-based counting (+1/-1) to avoid expensive COUNT(*) on every write

-- ============================================================
-- SUMMARY TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS jurisdiction_fulltext_stats (
    jurisdiction_code   TEXT PRIMARY KEY,
    jurisdiction_name   TEXT NOT NULL,
    total_decisions     BIGINT NOT NULL DEFAULT 0,
    fulltext_decisions  BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGER FUNCTIONS: delta-based (row-level)
-- ============================================================

-- For tables where full_text is a column on the same table
CREATE OR REPLACE FUNCTION trg_jurisdiction_stats_inline()
RETURNS TRIGGER AS $$
DECLARE
    v_code TEXT := TG_ARGV[0];
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions + 1,
            fulltext_decisions = fulltext_decisions + CASE WHEN NEW.full_text IS NOT NULL THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE jurisdiction_code = v_code;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions - 1,
            fulltext_decisions = fulltext_decisions - CASE WHEN OLD.full_text IS NOT NULL THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE jurisdiction_code = v_code;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Only fulltext status can change on UPDATE
        IF (OLD.full_text IS NULL) <> (NEW.full_text IS NULL) THEN
            UPDATE jurisdiction_fulltext_stats SET
                fulltext_decisions = fulltext_decisions
                    + CASE WHEN NEW.full_text IS NOT NULL THEN 1 ELSE 0 END
                    - CASE WHEN OLD.full_text IS NOT NULL THEN 1 ELSE 0 END,
                updated_at = NOW()
            WHERE jurisdiction_code = v_code;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- For edrsr_documents (total only, no full_text column)
CREATE OR REPLACE FUNCTION trg_jurisdiction_stats_edrsr_docs()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions + 1,
            updated_at = NOW()
        WHERE jurisdiction_code = 'UA';
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions - 1,
            updated_at = NOW()
        WHERE jurisdiction_code = 'UA';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- For edrsr_fulltext (fulltext count only)
CREATE OR REPLACE FUNCTION trg_jurisdiction_stats_edrsr_ft()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jurisdiction_fulltext_stats SET
            fulltext_decisions = fulltext_decisions + 1,
            updated_at = NOW()
        WHERE jurisdiction_code = 'UA';
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            fulltext_decisions = fulltext_decisions - 1,
            updated_at = NOW()
        WHERE jurisdiction_code = 'UA';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- For indian_hc_judgments (pdf_exists = true means fulltext)
CREATE OR REPLACE FUNCTION trg_jurisdiction_stats_india_hc()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions + 1,
            fulltext_decisions = fulltext_decisions + CASE WHEN NEW.pdf_exists = true THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-HC';
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions - 1,
            fulltext_decisions = fulltext_decisions - CASE WHEN OLD.pdf_exists = true THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-HC';
    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.pdf_exists IS DISTINCT FROM NEW.pdf_exists) THEN
            UPDATE jurisdiction_fulltext_stats SET
                fulltext_decisions = fulltext_decisions
                    + CASE WHEN NEW.pdf_exists = true THEN 1 ELSE 0 END
                    - CASE WHEN OLD.pdf_exists = true THEN 1 ELSE 0 END,
                updated_at = NOW()
            WHERE jurisdiction_code = 'IN-HC';
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- For indian_sc_judgments (total only, no fulltext column)
CREATE OR REPLACE FUNCTION trg_jurisdiction_stats_india_sc()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions + 1,
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-SC';
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = total_decisions - 1,
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-SC';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ATTACH TRIGGERS: Ukraine (EDRSR)
-- ============================================================

DROP TRIGGER IF EXISTS trg_jstats_edrsr_docs ON edrsr_documents;
CREATE TRIGGER trg_jstats_edrsr_docs
    AFTER INSERT OR DELETE ON edrsr_documents
    FOR EACH ROW EXECUTE FUNCTION trg_jurisdiction_stats_edrsr_docs();

DROP TRIGGER IF EXISTS trg_jstats_edrsr_ft ON edrsr_fulltext;
CREATE TRIGGER trg_jstats_edrsr_ft
    AFTER INSERT OR DELETE ON edrsr_fulltext
    FOR EACH ROW EXECUTE FUNCTION trg_jurisdiction_stats_edrsr_ft();

-- ============================================================
-- ATTACH TRIGGERS: International (inline full_text column)
-- ============================================================

DO $$
DECLARE
    rec RECORD;
    tbl_triggers TEXT[][] := ARRAY[
        ['ch_court_decisions', 'CH'],
        ['lu_court_decisions', 'LU'],
        ['pl_court_decisions', 'PL'],
        ['cz_court_decisions', 'CZ'],
        ['hu_court_decisions', 'HU'],
        ['lt_court_decisions', 'LT'],
        ['lv_court_decisions', 'LV'],
        ['ee_court_decisions', 'EE'],
        ['dk_court_decisions', 'DK'],
        ['se_court_decisions', 'SE'],
        ['fi_court_decisions', 'FI'],
        ['is_court_decisions', 'IS'],
        ['fr_court_decisions', 'FR'],
        ['de_court_decisions', 'DE'],
        ['be_court_decisions', 'BE'],
        ['uk_court_decisions', 'GB'],
        ['ie_court_decisions', 'IE'],
        ['us_court_opinions',  'US']
    ];
    i INT;
BEGIN
    FOR i IN 1..array_length(tbl_triggers, 1) LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_jstats ON %I', tbl_triggers[i][1]
        );
        EXECUTE format(
            $t$
            CREATE TRIGGER trg_jstats
                AFTER INSERT OR DELETE OR UPDATE OF full_text ON %I
                FOR EACH ROW EXECUTE FUNCTION trg_jurisdiction_stats_inline(%L)
            $t$,
            tbl_triggers[i][1], tbl_triggers[i][2]
        );
    END LOOP;
END $$;

-- ============================================================
-- ATTACH TRIGGERS: India (conditional)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indian_sc_judgments' AND table_schema = 'public') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_jstats ON indian_sc_judgments';
        EXECUTE $t$
            CREATE TRIGGER trg_jstats
                AFTER INSERT OR DELETE ON indian_sc_judgments
                FOR EACH ROW EXECUTE FUNCTION trg_jurisdiction_stats_india_sc()
        $t$;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indian_hc_judgments' AND table_schema = 'public') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_jstats ON indian_hc_judgments';
        EXECUTE $t$
            CREATE TRIGGER trg_jstats
                AFTER INSERT OR DELETE OR UPDATE OF pdf_exists ON indian_hc_judgments
                FOR EACH ROW EXECUTE FUNCTION trg_jurisdiction_stats_india_hc()
        $t$;
    END IF;
END $$;

-- ============================================================
-- SEED: one-time population from current data
-- ============================================================

INSERT INTO jurisdiction_fulltext_stats (jurisdiction_code, jurisdiction_name, total_decisions, fulltext_decisions, updated_at)
VALUES
    ('UA', 'Україна',
        (SELECT COUNT(*) FROM edrsr_documents),
        (SELECT COUNT(*) FROM edrsr_fulltext),
        NOW()),
    ('CH', 'Швейцарія',
        (SELECT COUNT(*) FROM ch_court_decisions),
        (SELECT COUNT(*) FROM ch_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('LU', 'Люксембург',
        (SELECT COUNT(*) FROM lu_court_decisions),
        (SELECT COUNT(*) FROM lu_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('PL', 'Польща',
        (SELECT COUNT(*) FROM pl_court_decisions),
        (SELECT COUNT(*) FROM pl_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('CZ', 'Чехія',
        (SELECT COUNT(*) FROM cz_court_decisions),
        (SELECT COUNT(*) FROM cz_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('HU', 'Угорщина',
        (SELECT COUNT(*) FROM hu_court_decisions),
        (SELECT COUNT(*) FROM hu_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('LT', 'Литва',
        (SELECT COUNT(*) FROM lt_court_decisions),
        (SELECT COUNT(*) FROM lt_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('LV', 'Латвія',
        (SELECT COUNT(*) FROM lv_court_decisions),
        (SELECT COUNT(*) FROM lv_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('EE', 'Естонія',
        (SELECT COUNT(*) FROM ee_court_decisions),
        (SELECT COUNT(*) FROM ee_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('DK', 'Данія',
        (SELECT COUNT(*) FROM dk_court_decisions),
        (SELECT COUNT(*) FROM dk_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('SE', 'Швеція',
        (SELECT COUNT(*) FROM se_court_decisions),
        (SELECT COUNT(*) FROM se_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('FI', 'Фінляндія',
        (SELECT COUNT(*) FROM fi_court_decisions),
        (SELECT COUNT(*) FROM fi_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('IS', 'Ісландія',
        (SELECT COUNT(*) FROM is_court_decisions),
        (SELECT COUNT(*) FROM is_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('FR', 'Франція',
        (SELECT COUNT(*) FROM fr_court_decisions),
        (SELECT COUNT(*) FROM fr_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('DE', 'Німеччина',
        (SELECT COUNT(*) FROM de_court_decisions),
        (SELECT COUNT(*) FROM de_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('BE', 'Бельгія',
        (SELECT COUNT(*) FROM be_court_decisions),
        (SELECT COUNT(*) FROM be_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('GB', 'Велика Британія',
        (SELECT COUNT(*) FROM uk_court_decisions),
        (SELECT COUNT(*) FROM uk_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('IE', 'Ірландія',
        (SELECT COUNT(*) FROM ie_court_decisions),
        (SELECT COUNT(*) FROM ie_court_decisions WHERE full_text IS NOT NULL),
        NOW()),
    ('US', 'США',
        (SELECT COUNT(*) FROM us_court_opinions),
        (SELECT COUNT(*) FROM us_court_opinions WHERE full_text IS NOT NULL),
        NOW())
ON CONFLICT (jurisdiction_code) DO UPDATE SET
    total_decisions    = EXCLUDED.total_decisions,
    fulltext_decisions = EXCLUDED.fulltext_decisions,
    updated_at         = NOW();

-- India (conditional)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indian_sc_judgments' AND table_schema = 'public') THEN
        INSERT INTO jurisdiction_fulltext_stats (jurisdiction_code, jurisdiction_name, total_decisions, fulltext_decisions, updated_at)
        VALUES ('IN-SC', 'Індія (Верховний суд)',
            (SELECT COUNT(*) FROM indian_sc_judgments), 0, NOW())
        ON CONFLICT (jurisdiction_code) DO UPDATE SET
            total_decisions = EXCLUDED.total_decisions, updated_at = NOW();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indian_hc_judgments' AND table_schema = 'public') THEN
        INSERT INTO jurisdiction_fulltext_stats (jurisdiction_code, jurisdiction_name, total_decisions, fulltext_decisions, updated_at)
        VALUES ('IN-HC', 'Індія (Високі суди)',
            (SELECT COUNT(*) FROM indian_hc_judgments),
            (SELECT COUNT(*) FROM indian_hc_judgments WHERE pdf_exists = true),
            NOW())
        ON CONFLICT (jurisdiction_code) DO UPDATE SET
            total_decisions = EXCLUDED.total_decisions,
            fulltext_decisions = EXCLUDED.fulltext_decisions,
            updated_at = NOW();
    END IF;
END $$;

-- ============================================================
-- CONVENIENCE VIEW: sorted by total_decisions descending
-- ============================================================

CREATE OR REPLACE VIEW v_jurisdiction_fulltext_stats AS
SELECT
    jurisdiction_code,
    jurisdiction_name,
    total_decisions,
    fulltext_decisions,
    CASE WHEN total_decisions > 0
        THEN ROUND(100.0 * fulltext_decisions / total_decisions, 1)
        ELSE 0
    END AS fulltext_pct,
    updated_at
FROM jurisdiction_fulltext_stats
ORDER BY total_decisions DESC;
