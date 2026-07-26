-- Migration 182: Dutch legislation text, article by article (LEXAI-1895)
--
-- Migration 181 gave us the register: 46,365 acts and 146,164 editions, each
-- with a direct xml_url to that version's text. It stored no text. So all
-- 2,507,190 rows in nl_legislation_citations resolve to an act and an edition
-- and then stop: the endpoint can say which version was in force on the day the
-- case was decided, but not what the provision said.
--
-- Source XML is KOOP's BWB-toestand schema: <toestand> wraps <wetgeving>, which
-- nests <boek>/<titeldeel>/<afdeling> and finally <artikel>, each <artikel>
-- holding <lid> paragraphs of <al> alineas. Article numbering is per book in
-- the civil code, which is why Dutch practice cites "6:162" and not "162" -
-- article_label below is stored in the form practice actually cites.
--
-- Storage note. Raw XML for the whole set measures ~63 GB (sampled mean 433 KB
-- across 60 editions), so the XML is not kept. Articles are the payload;
-- edition-level full text is stored only for the editions where the parser
-- found no <artikel> at all (mostly pre-1900 royal decrees), so the text of a
-- provision is never held twice.

-- One row per article per edition. The primary key is deliberately the citation
-- coordinates, so a lookup from nl_legislation_citations is a direct hit.
CREATE TABLE IF NOT EXISTS nl_law_articles (
    bwb_id        TEXT NOT NULL,
    valid_from    DATE NOT NULL,
    seq           INTEGER NOT NULL DEFAULT 0,
    article_label TEXT NOT NULL,          -- "162", "6:162", "3.2a" - as cited
    article_nr    TEXT,                   -- the bare <nr>, without the book
    book_nr       TEXT,                   -- <boek> number where the act has books
    title         TEXT,                   -- <kop><titel> if the article has one
    text          TEXT NOT NULL,
    n_chars       INTEGER NOT NULL DEFAULT 0,
    ord           INTEGER NOT NULL DEFAULT 0,   -- document order within edition
    PRIMARY KEY (bwb_id, valid_from, seq, article_label)
);

-- The lookup that matters: "what did article X of act Y say on date D".
CREATE INDEX IF NOT EXISTS idx_nl_law_articles_lookup
    ON nl_law_articles (bwb_id, article_label, valid_from);
CREATE INDEX IF NOT EXISTS idx_nl_law_articles_edition
    ON nl_law_articles (bwb_id, valid_from, seq);

-- One row per edition: the fetch record, plus full text only as a fallback.
CREATE TABLE IF NOT EXISTS nl_law_edition_texts (
    bwb_id        TEXT NOT NULL,
    valid_from    DATE NOT NULL,
    seq           INTEGER NOT NULL DEFAULT 0,
    text          TEXT,                   -- NULL when articles were extracted
    n_chars       INTEGER NOT NULL DEFAULT 0,   -- of the whole edition
    article_count INTEGER NOT NULL DEFAULT 0,
    xml_bytes     INTEGER,
    status        TEXT NOT NULL DEFAULT 'ok',   -- ok | no_articles | fetch_failed | parse_failed
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bwb_id, valid_from, seq)
);

CREATE INDEX IF NOT EXISTS idx_nl_law_edition_texts_status
    ON nl_law_edition_texts (status) WHERE status <> 'ok';

-- Full-text search over article text, Dutch stemming (the decisions table
-- already uses the 'dutch' config, so the two sides match).
CREATE INDEX IF NOT EXISTS idx_nl_law_articles_fts
    ON nl_law_articles USING GIN (to_tsvector('dutch', text));
