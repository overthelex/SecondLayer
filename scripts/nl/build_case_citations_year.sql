-- LEXAI-1884: decision → decision edges, extracted in Postgres itself.
--
-- Deliberately server-side: the texts are ~15.5GB in total, and pulling them to
-- a client to run Python regexes would move all of it over the wire for no gain.
-- Sharded by year so eight psql sessions can run at once (the box has 8 cores):
--   psql -c "SET my.yr=2015" -f build_case_citations_year.sql
--
-- Rows flagged by the left()-based encoding scan are skipped. That scan
-- over-reports (1,896 flagged, only 116 genuinely invalid), but a single
-- undecodable value aborts the whole statement, so losing 0.2% of documents in
-- this pass is the cheaper trade. They are re-run separately at the end.
\set ON_ERROR_STOP on

INSERT INTO nl_case_citations
    (from_ecli, to_ecli, to_raw, cite_kind, resolved, match_method, unresolved_reason,
     citation_context, from_court, from_date)
SELECT DISTINCT ON (d.ecli, hit.raw)
       d.ecli,
       res.to_ecli,
       hit.raw,
       hit.kind,
       res.to_ecli IS NOT NULL,
       res.method,
       CASE WHEN res.to_ecli IS NOT NULL THEN NULL
            WHEN hit.kind IN ('ecli_eu', 'ecli_echr') THEN 'external_corpus_not_loaded'
            WHEN hit.kind = 'ecli_nl' THEN 'ecli_not_in_corpus'
            ELSE 'alias_unknown' END,
       NULL,
       d.court_code,
       d.decision_date
FROM nl_rechtspraak_decisions d
CROSS JOIN LATERAL (
    -- one pass for ECLIs, one for the pre-2013 LJN codes; journal citations are
    -- resolved from the alias dictionary in a separate pass because their
    -- pattern is far more ambiguous inside running text
    SELECT m[1] AS raw,
           CASE WHEN m[1] LIKE 'ECLI:NL:%' THEN 'ecli_nl'
                WHEN m[1] LIKE 'ECLI:EU:%' THEN 'ecli_eu'
                WHEN m[1] LIKE 'ECLI:CE:%' THEN 'ecli_echr'
                ELSE 'ecli_other' END AS kind
    -- the ordinal may contain dots ("2014:11363.30") but must not end on one:
    -- a naive [A-Z0-9.]+ swallows the full stop that ends the sentence, which
    -- alone accounted for 88% of the unresolved edges on the first run
    FROM regexp_matches(d.full_text, '(ECLI:[A-Z]{2}:[A-Z]+:[0-9]{4}:[A-Z0-9]+(?:\.[A-Z0-9]+)*)', 'g') AS m
    UNION ALL
    SELECT 'LJN ' || m[1], 'ljn'
    FROM regexp_matches(d.full_text, '\mLJN[: ]\s?([A-Z]{2}[0-9]{4})\M', 'g') AS m
) hit
CROSS JOIN LATERAL (
    SELECT CASE
             WHEN hit.kind = 'ecli_nl'
               THEN (SELECT t.ecli FROM nl_rechtspraak_decisions t WHERE t.ecli = hit.raw)
             WHEN hit.kind = 'ljn'
               THEN (SELECT a.ecli FROM nl_case_aliases a
                      WHERE a.alias_kind = 'ljn' AND a.alias_norm = upper(replace(hit.raw, 'LJN ', ''))
                      LIMIT 1)
           END AS to_ecli,
           CASE WHEN hit.kind = 'ecli_nl' THEN 'direct_ecli'
                WHEN hit.kind = 'ljn' THEN 'alias_ljn'
                ELSE 'external' END AS method
) res
WHERE d.full_text IS NOT NULL
  AND d.decision_date >= make_date(current_setting('my.yr')::int, 1, 1)
  AND d.decision_date <  make_date(current_setting('my.yr')::int + 1, 1, 1)
  AND NOT EXISTS (SELECT 1 FROM nl_scan_errors2 b WHERE b.ecli = d.ecli)
  AND hit.raw <> d.ecli                      -- a decision citing itself is noise
ON CONFLICT (from_ecli, to_raw) DO NOTHING;
