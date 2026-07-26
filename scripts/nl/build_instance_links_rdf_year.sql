-- LEXAI-1885, pass 3: instance links from the source's own <dcterms:relation>.
--
-- This supersedes the heuristics. Rechtspraak states the chain explicitly in the
-- decision XML, which we already store:
--
--   <dcterms:relation rdfs:label="Formele relatie"
--       ecli:resourceIdentifier="ECLI:NL:GHARL:2019:2508"
--       psi:type="http://psi.rechtspraak.nl/cassatie"
--       psi:aanleg="http://psi.rechtspraak.nl/eerdereAanleg"
--       psi:gevolg="http://psi.rechtspraak.nl/gevolg#(Gedeeltelijke) vernietiging">
--
-- So the related ECLI, the relation type, which side is the earlier instance and
-- the outcome of the appeal all come from the publisher rather than from us
-- guessing. The earlier attempt (cited + shared case number + higher court)
-- produced zero links, because appeal courts assign their own case numbers: the
-- 3,075 pairs that do share one are almost all PHR/HR pairs already covered.
--
-- Sharded by year: psql -c "SET my.yr=2020" -f build_instance_links_rdf_year.sql
\set ON_ERROR_STOP on

INSERT INTO nl_instance_links (child_ecli, parent_ecli, relation, method, outcome, confidence)
SELECT DISTINCT
       -- psi:aanleg says whether the related decision came before or after this
       -- one, which is what fixes the direction of the edge
       CASE WHEN rel.aanleg = 'eerdereAanleg' THEN d.ecli ELSE rel.target END,
       CASE WHEN rel.aanleg = 'eerdereAanleg' THEN rel.target ELSE d.ecli END,
       -- psi:type is absent on a minority of relations (the outcome may still
       -- be there), so unknown ones land as 'related' rather than dropping the
       -- edge or violating NOT NULL
       COALESCE(CASE rel.rtype
            WHEN 'cassatie'    THEN 'cassation_of'
            WHEN 'hogerBeroep' THEN 'appeal_of'
            WHEN 'conclusie'   THEN 'conclusion_for'
            WHEN 'verwijzing'  THEN 'referred_back'
            ELSE rel.rtype
       END, 'related'),
       'rdf_relation',
       rel.gevolg,
       1.0
FROM nl_rechtspraak_decisions d
CROSS JOIN LATERAL regexp_matches(d.full_text_xml, '<dcterms:relation\s([^>]*)>', 'g') AS tag(attrs)
CROSS JOIN LATERAL (
    SELECT (regexp_match(tag.attrs[1], 'resourceIdentifier="([^"]+)"'))[1]              AS target,
           (regexp_match(tag.attrs[1], 'psi:type="http://psi\.rechtspraak\.nl/([^"#]+)'))[1]   AS rtype,
           (regexp_match(tag.attrs[1], 'psi:aanleg="http://psi\.rechtspraak\.nl/([^"#]+)'))[1] AS aanleg,
           (regexp_match(tag.attrs[1], 'psi:gevolg="http://psi\.rechtspraak\.nl/gevolg#([^"]+)"'))[1] AS gevolg
) rel
WHERE d.full_text_xml IS NOT NULL
  AND d.decision_date >= make_date(current_setting('my.yr')::int, 1, 1)
  AND d.decision_date <  make_date(current_setting('my.yr')::int + 1, 1, 1)
  AND rel.target IS NOT NULL
  AND rel.target <> d.ecli
  AND rel.target ~ '^ECLI:'
  AND rel.aanleg IS NOT NULL
ON CONFLICT (child_ecli, parent_ecli, relation) DO UPDATE
   SET method = 'rdf_relation',
       outcome = COALESCE(EXCLUDED.outcome, nl_instance_links.outcome),
       confidence = 1.0;
