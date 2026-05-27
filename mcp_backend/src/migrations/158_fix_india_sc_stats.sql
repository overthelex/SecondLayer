-- Migration 158: Fix IN-SC jurisdiction stats
-- Problem: indian_sc_judgments (38K metadata) and indian_court_fulltext source='sc' (149K fulltext)
-- are completely disjoint (zero CNR overlap). The fulltext trigger only tracked fulltext_decisions
-- but each fulltext entry is a distinct decision, so total_decisions was undercounted.
-- Fix: update trigger to also track total_decisions for SC, then re-seed from actual data.

-- ============================================================
-- UPDATED TRIGGER: indian_court_fulltext → jurisdiction_fulltext_stats
-- For SC: each fulltext entry is a distinct decision (no overlap with indian_sc_judgments),
-- so we increment both total_decisions and fulltext_decisions.
-- For HC: indian_hc_judgments already tracks total_decisions, so only fulltext_decisions.
-- ============================================================

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
            total_decisions    = total_decisions    + CASE WHEN v_code = 'IN-SC' THEN 1 ELSE 0 END,
            fulltext_decisions = fulltext_decisions + 1,
            updated_at = NOW()
        WHERE jurisdiction_code = v_code;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions    = total_decisions    - CASE WHEN v_code = 'IN-SC' THEN 1 ELSE 0 END,
            fulltext_decisions = fulltext_decisions - 1,
            updated_at = NOW()
        WHERE jurisdiction_code = v_code;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RE-SEED IN-SC: total = metadata + fulltext (disjoint sets)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'indian_sc_judgments' AND table_schema = 'public') THEN
        UPDATE jurisdiction_fulltext_stats SET
            total_decisions = (SELECT COUNT(*) FROM indian_sc_judgments)
                            + COALESCE((SELECT COUNT(*) FROM indian_court_fulltext WHERE source = 'sc'), 0),
            fulltext_decisions = COALESCE((SELECT COUNT(*) FROM indian_court_fulltext WHERE source = 'sc'), 0),
            updated_at = NOW()
        WHERE jurisdiction_code = 'IN-SC';
    END IF;
END $$;
