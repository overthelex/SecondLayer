\set ON_ERROR_STOP on
CREATE TEMP TABLE ae_stage_dubai(j jsonb);
\copy ae_stage_dubai(j) FROM '/tmp/ae_dubai.jsonl' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
SELECT count(*) AS staged, count(DISTINCT j->>'doc_id') AS distinct_ids FROM ae_stage_dubai;

INSERT INTO ae_court_decisions (
    doc_id, source, jurisdiction, court_name, court_level, case_number, neutral_citation,
    case_title, decision_date, language, parties, judges, decision_type, full_text,
    text_source, source_url, pdf_url, content_sha256, metadata_json)
SELECT DISTINCT ON (j->>'doc_id')
    j->>'doc_id', j->>'source', j->>'jurisdiction', j->>'court_name', j->>'court_level',
    j->>'case_number', j->>'neutral_citation', j->>'case_title',
    NULLIF(j->>'decision_date','')::date, j->>'language', j->>'parties',
    CASE WHEN jsonb_typeof(j->'judges') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(j->'judges')) END,
    j->>'decision_type', j->>'full_text', j->>'text_source', j->>'source_url',
    j->>'pdf_url', j->>'content_sha256', j->'metadata_json'
FROM ae_stage_dubai
ORDER BY j->>'doc_id', length(j->>'full_text') DESC NULLS LAST
ON CONFLICT (doc_id) DO UPDATE SET
    full_text = EXCLUDED.full_text, case_title = EXCLUDED.case_title,
    decision_date = EXCLUDED.decision_date, case_number = EXCLUDED.case_number,
    decision_type = EXCLUDED.decision_type, content_sha256 = EXCLUDED.content_sha256,
    metadata_json = EXCLUDED.metadata_json, updated_at = now();

\echo '=== dubai_courts by court level ==='
SELECT court_level, count(*) AS docs,
       min(decision_date) AS first, max(decision_date) AS last,
       pg_size_pretty(sum(length(full_text))::bigint) AS text,
       round(avg(length(full_text))) AS avg_chars
FROM ae_court_decisions WHERE source = 'dubai_courts'
GROUP BY 1 ORDER BY 2 DESC;

\echo '=== quality ==='
SELECT count(*) AS rows,
       count(*) FILTER (WHERE decision_date IS NULL) AS no_date,
       count(*) FILTER (WHERE full_text IS NULL OR length(full_text) < 500) AS thin,
       count(DISTINCT content_sha256) AS distinct_texts,
       count(*) FILTER (WHERE full_text !~ '[؀-ۿ]') AS no_arabic
FROM ae_court_decisions WHERE source = 'dubai_courts';

\echo '=== arabic FTS smoke test (must return rows) ==='
SELECT count(*) AS hits_for_labour_contract
FROM ae_court_decisions
WHERE source = 'dubai_courts' AND language = 'ar'
  AND to_tsvector('arabic', coalesce(case_title,'') || ' ' || coalesce(full_text,''))
      @@ plainto_tsquery('arabic', 'عقد العمل');

\echo '=== whole table ==='
SELECT source, count(*) FROM ae_court_decisions GROUP BY 1 ORDER BY 2 DESC;
