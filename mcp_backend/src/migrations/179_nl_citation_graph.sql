-- Migration 179: NL Rechtspraak citation graph (LEXAI-1880)
--
-- The Dutch corpus is loaded (3.6M ECLIs, 946k with text). This adds the graph
-- layer the grounded-substrate product needs per jurisdiction: decision→decision
-- and decision→article edges, the alias dictionary that lets old-style citations
-- resolve, the instance chain, and precedent status.
--
-- Shape follows what already works for Ukraine (case_citation_links,
-- law_court_citations, precedent_status), with one difference: NL has a real
-- canonical id, so edges point at ECLI directly instead of a case number that
-- has to be matched later.
--
-- Indexes on the big nl_rechtspraak_decisions table are NOT here: that table is
-- 28GB and rebuilding an index on it must be CONCURRENTLY, which cannot run
-- inside the implicit transaction the migration runner uses. See
-- scripts/nl/179b_nl_decisions_indexes_concurrently.sql.

-- ---------------------------------------------------------------------------
-- 1. Alias dictionary: what a citation can be written as, and which ECLI it is.
--    Filled from metadata_json->'hasVersion' (1,006,924 rows carry journal
--    publications like "NJ 2020/123") plus LJN codes and case numbers.
--    Without this, roughly one citation in ten never resolves: LJN appears in
--    1.9% of texts and journal references in 9.3%.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_case_aliases (
    alias_kind  TEXT NOT NULL,          -- ljn | journal | zaaknummer | deeplink
    alias_norm  TEXT NOT NULL,          -- normalized: uppercase, no spaces
    ecli        TEXT NOT NULL,
    source      TEXT NOT NULL,          -- hasVersion | case_number | text
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alias_kind, alias_norm, ecli)
);

CREATE INDEX IF NOT EXISTS idx_nl_alias_ecli ON nl_case_aliases (ecli);

-- ---------------------------------------------------------------------------
-- 2. Decision → decision edges.
--    to_ecli stays NULL until the citation resolves; resolved/match_method/
--    unresolved_reason exist so "every reference resolves" is a number we can
--    report rather than a claim.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_case_citations (
    id                BIGSERIAL PRIMARY KEY,
    from_ecli         TEXT NOT NULL,
    to_ecli           TEXT,
    to_raw            TEXT NOT NULL,    -- exactly as written in the text
    cite_kind         TEXT NOT NULL,    -- ecli_nl | ecli_eu | ecli_echr | ljn | journal | zaaknummer
    resolved          BOOLEAN NOT NULL DEFAULT false,
    match_method      TEXT,             -- direct_ecli | alias_ljn | alias_journal | external
    unresolved_reason TEXT,
    treatment         TEXT,             -- followed | applied | distinguished | overruled (filled later, by a model)
    citation_context  TEXT,
    from_court        TEXT,             -- denormalized so filters need no join
    from_date         DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_ecli, to_raw)
);

CREATE INDEX IF NOT EXISTS idx_nl_cc_to      ON nl_case_citations (to_ecli) WHERE resolved;
CREATE INDEX IF NOT EXISTS idx_nl_cc_from    ON nl_case_citations (from_ecli);
CREATE INDEX IF NOT EXISTS idx_nl_cc_unres   ON nl_case_citations (cite_kind) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_nl_cc_date    ON nl_case_citations (from_date);

-- ---------------------------------------------------------------------------
-- 3. Decision → statute article edges.
--    Two provenances: 'rdf' comes from dcterms:references, which the source
--    already publishes pre-parsed for 126,118 decisions ("Wetboek van Strafrecht
--    285b"). That set doubles as the reference against which the text extractor
--    is measured before it is let loose on the other ~5.8M raw mentions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_legislation_citations (
    id               BIGSERIAL PRIMARY KEY,
    from_ecli        TEXT NOT NULL,
    law_name_raw     TEXT NOT NULL,     -- "Burgerlijk Wetboek Boek 3"
    law_id           TEXT,              -- BWB / ELI once resolved
    article          TEXT,
    lid              TEXT,              -- sub-article ("lid 2")
    cite_kind        TEXT NOT NULL,     -- rdf | text
    resolved         BOOLEAN NOT NULL DEFAULT false,
    citation_context TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_ecli, law_name_raw, article, lid, cite_kind)
);

CREATE INDEX IF NOT EXISTS idx_nl_lc_from    ON nl_legislation_citations (from_ecli);
CREATE INDEX IF NOT EXISTS idx_nl_lc_law     ON nl_legislation_citations (law_id, article) WHERE resolved;
CREATE INDEX IF NOT EXISTS idx_nl_lc_rawname ON nl_legislation_citations (law_name_raw);

-- ---------------------------------------------------------------------------
-- 4. Instance chain.
--    The authoritative source is <dcterms:relation> in the decision XML, which
--    carries the related ECLI, the relation type (cassatie / conclusie /
--    hogerBeroep), which side is the earlier instance, and the outcome. It is
--    present for ~6% of decisions, i.e. roughly the share that actually has a
--    higher instance. Case-number pairing of PHR conclusions is kept as a
--    fallback for documents whose XML predates the relation element.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_instance_links (
    child_ecli  TEXT NOT NULL,
    parent_ecli TEXT NOT NULL,
    relation    TEXT NOT NULL,          -- appeal_of | cassation_of | conclusion_for | referred_back
    method      TEXT NOT NULL,          -- rdf_relation | phr_pair | zaaknummer | text_ref
    -- the source states the outcome of the appeal itself ("(Gedeeltelijke)
    -- vernietiging", "Bekrachtiging/bevestiging"), so precedent status does not
    -- have to be inferred from citation text for these edges
    outcome     TEXT,
    confidence  REAL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (child_ecli, parent_ecli, relation)
);

CREATE INDEX IF NOT EXISTS idx_nl_il_parent ON nl_instance_links (parent_ecli);

-- ---------------------------------------------------------------------------
-- 5. Precedent status, computed from the two edge tables above.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_precedent_status (
    ecli           TEXT PRIMARY KEY,
    status         TEXT,                -- good_law | overruled | quashed | superseded
    overruled_by   TEXT[],
    cited_by_count INTEGER NOT NULL DEFAULT 0,
    last_computed  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_ps_status ON nl_precedent_status (status);
CREATE INDEX IF NOT EXISTS idx_nl_ps_cited  ON nl_precedent_status (cited_by_count DESC);

-- ---------------------------------------------------------------------------
-- 6. Passage roles for the role-aware judge (shared taxonomy, LEXAI-1843).
--    Only the 946k decisions that have a body can have passages.
--    NL note: the taxonomy's `dissent` role stays empty here. Dutch courts do
--    not publish dissenting opinions; the functional analogue is the AG's
--    conclusion, which is a separate document, so that role arrives at document
--    level through nl_instance_links.relation = 'conclusion_for'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_passages (
    passage_id TEXT PRIMARY KEY,        -- <ecli>h1 / o1 / r1
    ecli       TEXT NOT NULL,
    role       TEXT NOT NULL,           -- holding | overruled_lower | rejected_argument | unrelated
    char_from  INTEGER,
    char_to    INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_passages_ecli ON nl_passages (ecli, role);
