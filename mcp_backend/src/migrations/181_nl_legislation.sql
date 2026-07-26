-- Migration 181: Dutch legislation with its editions (LEXAI-1893)
--
-- Spec point 4, "legislation across time". This is the one layer NL had nothing
-- for: all 2,507,190 rows in nl_legislation_citations carry a law name in text
-- and a NULL law_id, so a statute reference cannot be resolved to a node, let
-- alone to the version in force on the day the case was decided.
--
-- Source: KOOP's SRU service over the Basiswettenbestand,
--   http://zoekservice.overheid.nl/sru/Search?x-connection=BWB
-- (http, not https - the TLS host does not answer). It reports 147,534 records,
-- one per *toestand*, i.e. per version of a regulation, and each record already
-- carries the validity period and a direct URL to that version's XML. So the
-- edition layer comes from metadata alone; the 160GB full-text basisset is a
-- separate decision.
--
-- Shape mirrors legislation_editions / legislation_article_amendments, which
-- already serve Ukraine, rather than inventing a second vocabulary.

-- One row per regulation.
CREATE TABLE IF NOT EXISTS nl_laws (
    bwb_id       TEXT PRIMARY KEY,          -- BWBR0005537
    title        TEXT,
    law_type     TEXT,                      -- wet | AMvB | ministeriele-regeling | verdrag ...
    authority    TEXT,                      -- responsible ministry
    creator      TEXT,
    rechtsgebied TEXT[],                    -- legal areas, as the source lists them
    first_start  DATE,                      -- earliest edition start we have seen
    last_end     DATE,                      -- latest edition end (9999-12-31 = still in force)
    edition_count INTEGER NOT NULL DEFAULT 0,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_laws_title ON nl_laws (title);
CREATE INDEX IF NOT EXISTS idx_nl_laws_title_trgm ON nl_laws USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nl_laws_type ON nl_laws (law_type);

-- One row per version. start/end are what makes point-in-time answers possible:
-- given a decision date, the edition in force is the one whose period contains it.
CREATE TABLE IF NOT EXISTS nl_law_editions (
    bwb_id        TEXT NOT NULL,
    valid_from    DATE NOT NULL,
    seq           INTEGER NOT NULL DEFAULT 0,  -- the /0, /1 suffix on the toestand URI
    valid_to      DATE,
    toestand_uri  TEXT,                        -- http://wetten.overheid.nl/id/BWBR.../1998-01-01/0
    xml_url       TEXT,                        -- direct link to this version's text
    wti_url       TEXT,                        -- amendment history document
    modified      DATE,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bwb_id, valid_from, seq)
);

CREATE INDEX IF NOT EXISTS idx_nl_editions_period ON nl_law_editions (bwb_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_nl_editions_from   ON nl_law_editions (valid_from);

-- law_id on the citation table points at nl_laws.bwb_id once resolved.
CREATE INDEX IF NOT EXISTS idx_nl_lc_lawid_notnull
    ON nl_legislation_citations (law_id) WHERE law_id IS NOT NULL;
