-- LEXAI-1883 pass 2, step 1: the abbreviation dictionary.
--
-- Canonical names are taken verbatim from what dcterms:references already
-- publishes, so text-extracted edges and source-provided edges land on the same
-- law and can be compared. Two article conventions have to be distinguished:
--
--   "artikel 7:658 BW"  → law "Burgerlijk Wetboek Boek 7", article "658"
--                         (the civil code puts the book in the law's name)
--   "artikel 3:4 Awb"   → law "Algemene wet bestuursrecht", article "3:4"
--                         (the administrative act keeps the colon in the article)
--
-- Getting that backwards silently points every civil-code edge at a
-- non-existent article, which is why article_style is explicit here.
CREATE TABLE IF NOT EXISTS nl_law_abbrev (
    abbrev        TEXT PRIMARY KEY,
    law_name      TEXT NOT NULL,
    article_style TEXT NOT NULL DEFAULT 'plain'   -- plain | book_colon
);

INSERT INTO nl_law_abbrev (abbrev, law_name, article_style) VALUES
    ('BW',   'Burgerlijk Wetboek',                                  'book_colon'),
    ('Awb',  'Algemene wet bestuursrecht',                          'plain'),
    ('Sr',   'Wetboek van Strafrecht',                              'plain'),
    ('Sv',   'Wetboek van Strafvordering',                          'plain'),
    ('Rv',   'Wetboek van Burgerlijke Rechtsvordering',             'plain'),
    ('Fw',   'Faillissementswet',                                   'plain'),
    ('AWR',  'Algemene wet inzake rijksbelastingen',                'plain'),
    ('Gw',   'Grondwet',                                            'plain'),
    ('Vw',   'Vreemdelingenwet 2000',                               'plain'),
    ('Wvw',  'Wegenverkeerswet 1994',                               'plain'),
    ('WVW',  'Wegenverkeerswet 1994',                               'plain'),
    ('EVRM', 'Verdrag tot bescherming van de rechten van de mens en de fundamentele vrijheden', 'plain'),
    ('IVRK', 'Verdrag inzake de rechten van het kind',              'plain')
ON CONFLICT (abbrev) DO UPDATE
   SET law_name = EXCLUDED.law_name, article_style = EXCLUDED.article_style;

\echo == every canonical name must exist in the reference set, or the two passes disagree ==
SELECT a.abbrev, a.law_name,
       (SELECT count(*) FROM nl_legislation_citations c
         WHERE c.cite_kind = 'rdf'
           AND (c.law_name_raw = a.law_name
                OR (a.article_style = 'book_colon' AND c.law_name_raw LIKE a.law_name || ' Boek %')))
       AS rdf_edges_for_this_law
FROM nl_law_abbrev a ORDER BY 3 DESC;
