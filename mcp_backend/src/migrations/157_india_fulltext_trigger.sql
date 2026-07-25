-- Migration 157: Add trigger on indian_court_fulltext for jurisdiction_fulltext_stats
-- The indian_court_fulltext table stores extracted text from PDFs
-- source = 'sc' → IN-SC, source = 'hc' → IN-HC

CREATE OR REPLACE FUNCTION trg_jurisdiction_stats_india_fulltext()
RETURNS TRIGGER AS $$
DECLARE
    v_code TEXT;
    v_src TEXT;
BEGIN
    v_src := CASE WHEN TG_OP = 'DELETE' THEN OLD.source ELSE NEW.source END;
    v_code := CASE WHEN v_src = 'sc' THEN 'IN-SC' WHEN v_src = 'hc' THEN 'IN-HC' END;

    IF v_code IS NULL THEN RETURN NULL; END IF;

    IF TG_OP = 'INSERT' THEN
        UPDATE jurisdiction_fulltext_stats SET
            fulltext_decisions = fulltext_decisions + 1,
            updated_at = NOW()
        WHERE jurisdiction_code = v_code;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            fulltext_decisions = fulltext_decisions - 1,
            updated_at = NOW()
        WHERE jurisdiction_code = v_code;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger will be attached when indian_court_fulltext table exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indian_court_fulltext' AND table_schema = 'public') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_jstats_india_ft ON indian_court_fulltext';
        EXECUTE $t$
            CREATE TRIGGER trg_jstats_india_ft
                AFTER INSERT OR DELETE ON indian_court_fulltext
                FOR EACH ROW EXECUTE FUNCTION trg_jurisdiction_stats_india_fulltext()
        $t$;

        -- Re-seed from actual data
        UPDATE jurisdiction_fulltext_stats SET
            fulltext_decisions = COALESCE((SELECT COUNT(*) FROM indian_court_fulltext WHERE source = 'sc'), 0),
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-SC';

        UPDATE jurisdiction_fulltext_stats SET
            fulltext_decisions = COALESCE((SELECT COUNT(*) FROM indian_court_fulltext WHERE source = 'hc'), 0),
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-HC';
    END IF;
END $$;
