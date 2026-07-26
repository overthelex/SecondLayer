-- Migration 180: CJEU decisions as resolvable citation targets (LEXAI-1892)
--
-- The NL graph produced 59,132 edges pointing at ECLI:EU:C/T/F decisions and
-- almost none of them resolve: the existing eu_curia_cases table holds 35,764
-- rows, but 28,857 are malformed placeholders like
-- "ECLI:EU:CJ:82005IT0119(02)" with no case number and no case name, leaving
-- 6,888 usable against the 6,335 distinct decisions our corpus cites.
--
-- A separate table rather than a top-up of eu_curia_cases: that table is wired
-- into other code, and mixing a clean load into a set that is three quarters
-- placeholders makes both harder to reason about.
--
-- Source: CELLAR SPARQL (publications.europa.eu/webapi/rdf/sparql), CC BY under
-- 2011/833/EU, so unlike ECHR the text may be stored and served.

CREATE TABLE IF NOT EXISTS eu_cjeu_decisions (
    ecli          TEXT PRIMARY KEY,
    celex         TEXT,
    court         TEXT,              -- C (Court of Justice) | T (General Court) | F (Civil Service Tribunal)
    decision_date DATE,
    title         TEXT,
    doc_type      TEXT,              -- judgment | opinion | order, derived from the CELEX sector code
    full_text     TEXT,              -- left NULL by the metadata pass
    source_url    TEXT,
    metadata_json JSONB,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eu_cjeu_celex ON eu_cjeu_decisions (celex);
CREATE INDEX IF NOT EXISTS idx_eu_cjeu_date  ON eu_cjeu_decisions (decision_date);
CREATE INDEX IF NOT EXISTS idx_eu_cjeu_court ON eu_cjeu_decisions (court, decision_date DESC);
