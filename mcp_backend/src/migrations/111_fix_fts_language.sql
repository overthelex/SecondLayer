-- Fix FTS language: 'russian' → 'simple' for Ukrainian text on court_sessions
-- Russian stemmer gives incorrect results for Ukrainian morphology

DROP INDEX IF EXISTS idx_court_sessions_court;
CREATE INDEX IF NOT EXISTS idx_court_sessions_court ON court_sessions USING gin(to_tsvector('simple', court_name));

DROP INDEX IF EXISTS idx_court_sessions_parties;
CREATE INDEX IF NOT EXISTS idx_court_sessions_parties ON court_sessions USING gin(to_tsvector('simple', involved_parties));
