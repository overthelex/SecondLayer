-- LEXAI-1883 pass 2c: laws written out in full, dictionary generated from the
-- reference set instead of hand-listed.
--
-- Splitting recall by dictionary coverage showed where the ceiling was:
--   law in our 13-entry dictionary   60,759 reference edges, 62.2% found
--   law not in it                    17,703 reference edges,  0.0% found
-- So the extractor was not weak, the dictionary was: 13 laws against the 2,244
-- that dcterms:references names. The fix is to let the reference set be the
-- dictionary, and to build the alternation at run time rather than typing it.
--
-- Only laws that appear at least MIN_EDGES times are taken: a name seen twice
-- adds regex cost without adding recall, and long rare names raise the odds of
-- matching something that is not a citation.
SET max_parallel_workers_per_gather = 6;
\timing on

DO $$
DECLARE
    pattern   text;
    law_count int;
    inserted  bigint;
BEGIN
    -- Build "Name A|Name B|..." from the reference set, longest first so that
    -- "Vreemdelingenwet 2000" wins over "Vreemdelingenwet", and with regex
    -- metacharacters escaped: several names contain dots and parentheses.
    SELECT string_agg(regexp_replace(law, '([.()\[\]{}*+?^$|\\])', '\\\1', 'g'), '|'
                      ORDER BY length(law) DESC), count(*)
      INTO pattern, law_count
      FROM (SELECT btrim(regexp_replace(law_name_raw, '\s*\(.*\)$', '')) AS law
              FROM nl_legislation_citations
             WHERE cite_kind = 'rdf'
             GROUP BY 1
            HAVING count(*) >= 200) x;

    RAISE NOTICE 'dictionary: % laws', law_count;

    EXECUTE format($f$
        INSERT INTO nl_legislation_citations
            (from_ecli, law_name_raw, article, lid, cite_kind, resolved)
        SELECT DISTINCT ON (d.ecli, m[2], num.one)
               d.ecli, m[2], num.one, NULL, 'text', true
        FROM nl_rechtspraak_decisions d
        CROSS JOIN LATERAL regexp_matches(
                d.full_text,
                '(?:[Aa]rtikel|[Aa]rt\.|[Aa]rtikelen|[Aa]rtt\.)\s*((?:[0-9]+[a-zA-Z]?(?:\s*,\s*|\s+en\s+))*[0-9]+[a-zA-Z]?)\s*(?:lid\s*[0-9]+\s*)?(?:van\s+(?:het|de)\s+)(%s)\M',
                'g') AS m
        CROSS JOIN LATERAL unnest(regexp_split_to_array(m[1], '\s*,\s*|\s+en\s+')) AS num(one)
        WHERE d.full_text IS NOT NULL
          AND d.decision_date >= make_date(%s, 1, 1)
          AND d.decision_date <  make_date(%s, 1, 1)
          AND NOT EXISTS (SELECT 1 FROM nl_scan_errors2 b WHERE b.ecli = d.ecli)
          AND btrim(num.one) <> ''
        ON CONFLICT DO NOTHING
    $f$, pattern,
         current_setting('my.yr')::int,
         current_setting('my.yr')::int + 1);

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RAISE NOTICE 'year % : % edges', current_setting('my.yr'), inserted;
END $$;
