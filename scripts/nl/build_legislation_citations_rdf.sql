-- LEXAI-1883, pass 1: decision → statute edges straight from dcterms:references.
--
-- The source publishes these already parsed, as "<law name> <article>":
--   "Wetboek van Strafrecht 285b", "Burgerlijk Wetboek Boek 3 37"
-- 128,631 decisions carry the field (84,209 as a JSON array, 44,422 as a single
-- string), so both shapes have to be unwrapped.
--
-- These rows are also the reference set the text extractor (pass 2) is scored
-- against before it is trusted on the other ~5.8M raw "artikel N" mentions.
SET max_parallel_workers_per_gather = 6;
\timing on

-- idempotent: this pass is the only writer of cite_kind='rdf'
DELETE FROM nl_legislation_citations WHERE cite_kind = 'rdf';

INSERT INTO nl_legislation_citations
    (from_ecli, law_name_raw, article, lid, cite_kind, resolved)
SELECT DISTINCT ON (d.ecli, parsed.law_name, parsed.article)
       d.ecli,
       parsed.law_name,
       parsed.article,
       NULL,
       'rdf',
       false
FROM nl_rechtspraak_decisions d
-- normalize both shapes to an array first: a set-returning function cannot
-- live inside CASE, so the branch picks the array and the unnest comes after
CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.metadata_json->'references') = 'array'
         THEN d.metadata_json->'references'
         ELSE jsonb_build_array(d.metadata_json->>'references')
    END
) AS r(ref)
CROSS JOIN LATERAL (
    -- article is the trailing token: digits plus an optional letter suffix
    -- ("285b") and an optional book:article form ("6:162")
    SELECT btrim((regexp_match(r.ref, '^(.*?)\s+([0-9]+[a-zA-Z]*(?::[0-9]+[a-zA-Z]*)?)$'))[1]) AS head,
           (regexp_match(r.ref, '^(.*?)\s+([0-9]+[a-zA-Z]*(?::[0-9]+[a-zA-Z]*)?)$'))[2]        AS tail
) raw
CROSS JOIN LATERAL (
    -- "Burgerlijk Wetboek Boek 3" has no article at all: the trailing number is
    -- the book, part of the law's name. Without this the book number is stored
    -- as an article and every civil-code reference points at the wrong provision.
    SELECT CASE WHEN raw.head ~ '\mBoek$' THEN raw.head || ' ' || raw.tail ELSE raw.head END AS law_name,
           CASE WHEN raw.head ~ '\mBoek$' THEN NULL ELSE raw.tail END                        AS article
) parsed
WHERE d.metadata_json ? 'references'
  AND parsed.law_name IS NOT NULL
  AND parsed.law_name <> ''
ON CONFLICT DO NOTHING;

\echo == result ==
SELECT count(*) AS edges,
       count(DISTINCT from_ecli) AS decisions,
       count(DISTINCT law_name_raw) AS distinct_laws
FROM nl_legislation_citations WHERE cite_kind = 'rdf';

\echo == unparsed references (no trailing article token) ==
SELECT count(*) AS decisions_with_refs_but_no_edge
FROM nl_rechtspraak_decisions d
WHERE d.metadata_json ? 'references'
  AND NOT EXISTS (SELECT 1 FROM nl_legislation_citations c WHERE c.from_ecli = d.ecli);

\echo == top laws ==
SELECT law_name_raw, count(*) AS edges
FROM nl_legislation_citations WHERE cite_kind = 'rdf'
GROUP BY 1 ORDER BY 2 DESC LIMIT 12;
