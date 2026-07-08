-- 016_me_datasets_trgm.sql
-- Trigram search for the me.gov.ua dataset discovery tool (search_me_datasets).
--
-- The 'simple' FTS config has no Ukrainian stemming, so single-word queries in a
-- different inflection than the dataset title miss (e.g. "квоти" vs "квот",
-- "ліцензія" vs "ліцензії"). pg_trgm word_similarity bridges these morphological
-- variants. Only 69 datasets, but the GIN trigram index keeps it clean.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_me_datasets_trgm
    ON me_datasets
    USING gin ((coalesce(title, '') || ' ' || coalesce(notes, '')) gin_trgm_ops);
