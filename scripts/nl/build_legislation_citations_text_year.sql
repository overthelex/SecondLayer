-- LEXAI-1883 pass 2: statute references extracted from the decision text.
--
-- Scope of this pass is deliberately the high-precision half. Measured on a
-- sample of 162 texts, "artikel N" appears 986 times and 43% of those carry no
-- law next to the number at all: they lean on what was named earlier in the
-- paragraph. Chasing those needs context tracking and belongs in a later pass;
-- guessing them now would pollute the graph with edges nobody can trust.
--
-- Here we take only mentions where the law is stated next to the article, via
-- the abbreviation dictionary (nl_law_abbrev). Precision is then measured
-- against the 250k edges dcterms:references gave us for free.
--
-- Sharded by year: psql -c "SET my.yr=2020" -f build_legislation_citations_text_year.sql
\set ON_ERROR_STOP on

INSERT INTO nl_legislation_citations
    (from_ecli, law_name_raw, article, lid, cite_kind, resolved)
SELECT DISTINCT ON (d.ecli, parsed.law_name, parsed.article)
       d.ecli,
       parsed.law_name,
       parsed.article,
       NULL,
       'text',
       parsed.article IS NOT NULL
FROM nl_rechtspraak_decisions d
CROSS JOIN LATERAL regexp_matches(
        d.full_text,
        -- "artikel"/"art." + number (optionally book:article) + optional "lid N"
        -- + a known abbreviation. The keyword is matched case-insensitively by
        -- hand because a global 'i' flag would also match "bw" or "sr" in prose.
        '(?:[Aa]rtikel|[Aa]rt\.)\s*([0-9]+[a-zA-Z]?(?::[0-9]+[a-zA-Z]?)?)\s*(?:lid\s*[0-9]+\s*)?(BW|Awb|Sr|Sv|Rv|Fw|AWR|Gw|Vw|Wvw|WVW|EVRM|IVRK)\M',
        'g') AS m
JOIN nl_law_abbrev ab ON ab.abbrev = m[2]
CROSS JOIN LATERAL (
    SELECT CASE
             -- civil code: the book lives in the law's name, so 7:658 becomes
             -- "Burgerlijk Wetboek Boek 7" + article 658
             WHEN ab.article_style = 'book_colon' AND m[1] ~ '^[0-9]+[aA]?:'
               THEN ab.law_name || ' Boek ' || split_part(m[1], ':', 1)
             ELSE ab.law_name
           END AS law_name,
           CASE
             WHEN ab.article_style = 'book_colon' AND m[1] ~ '^[0-9]+[aA]?:'
               THEN split_part(m[1], ':', 2)
             -- "artikel 6 BW" without a book cannot be placed in a book, so the
             -- article is left NULL and the edge is marked unresolved rather
             -- than silently attached to the wrong one
             WHEN ab.article_style = 'book_colon'
               THEN NULL
             ELSE m[1]
           END AS article
) parsed
WHERE d.full_text IS NOT NULL
  AND d.decision_date >= make_date(current_setting('my.yr')::int, 1, 1)
  AND d.decision_date <  make_date(current_setting('my.yr')::int + 1, 1, 1)
  AND NOT EXISTS (SELECT 1 FROM nl_scan_errors2 b WHERE b.ecli = d.ecli)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Pass 2b: enumerations, and the law written out in full.
--
-- Measuring 2a against the reference set showed precision is fine (all six
-- unconfirmed edges inspected quoted the article verbatim: "artikel 8:42 Awb",
-- "artikel 2:343 BW", "artikel 7:623 BW") but recall was 45.7%, and the misses
-- were dominated by the criminal code: 239 of them. Criminal judgments list the
-- applied provisions as a run - "de artikelen 47, 57 en 310 van het Wetboek van
-- Strafrecht" - so the abbreviation never sits next to each number.
--
-- This pass captures the list, then splits it.
-- ---------------------------------------------------------------------------
INSERT INTO nl_legislation_citations
    (from_ecli, law_name_raw, article, lid, cite_kind, resolved)
SELECT DISTINCT ON (d.ecli, parsed.law_name, parsed.article)
       d.ecli, parsed.law_name, parsed.article, NULL, 'text', parsed.article IS NOT NULL
FROM nl_rechtspraak_decisions d
CROSS JOIN LATERAL regexp_matches(
        d.full_text,
        '(?:[Aa]rtikelen|[Aa]rtt\.)\s*((?:[0-9]+[a-zA-Z]?(?::[0-9]+[a-zA-Z]?)?(?:\s*,\s*|\s+en\s+))+[0-9]+[a-zA-Z]?(?::[0-9]+[a-zA-Z]?)?)\s*(?:van\s+(?:het|de)\s+)?(BW|Awb|Sr|Sv|Rv|Fw|AWR|Gw|Vw|Wvw|WVW|EVRM|IVRK|Wetboek van Strafrecht|Wetboek van Strafvordering|Burgerlijk Wetboek|Algemene wet bestuursrecht|Faillissementswet)\M',
        'g') AS m
CROSS JOIN LATERAL unnest(regexp_split_to_array(m[1], '\s*,\s*|\s+en\s+')) AS num(one)
JOIN nl_law_abbrev ab ON ab.abbrev = m[2] OR ab.law_name = m[2]
CROSS JOIN LATERAL (
    SELECT CASE WHEN ab.article_style = 'book_colon' AND num.one ~ '^[0-9]+[aA]?:'
                THEN ab.law_name || ' Boek ' || split_part(num.one, ':', 1)
                ELSE ab.law_name END AS law_name,
           CASE WHEN ab.article_style = 'book_colon' AND num.one ~ '^[0-9]+[aA]?:'
                THEN split_part(num.one, ':', 2)
                WHEN ab.article_style = 'book_colon' THEN NULL
                ELSE num.one END AS article
) parsed
WHERE d.full_text IS NOT NULL
  AND d.decision_date >= make_date(current_setting('my.yr')::int, 1, 1)
  AND d.decision_date <  make_date(current_setting('my.yr')::int + 1, 1, 1)
  AND NOT EXISTS (SELECT 1 FROM nl_scan_errors2 b WHERE b.ecli = d.ecli)
  AND btrim(num.one) <> ''
ON CONFLICT DO NOTHING;
