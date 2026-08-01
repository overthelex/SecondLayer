\set ON_ERROR_STOP on
CREATE TEMP TABLE ae_stage(j jsonb);
\copy ae_stage(j) FROM '/tmp/ae_all_full.jsonl' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
SELECT count(*) AS staged, count(DISTINCT j->>'doc_id') AS distinct_ids FROM ae_stage;

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
FROM ae_stage
ORDER BY j->>'doc_id', length(j->>'full_text') DESC NULLS LAST
ON CONFLICT (doc_id) DO UPDATE SET
    full_text = EXCLUDED.full_text, case_title = EXCLUDED.case_title,
    decision_date = EXCLUDED.decision_date, case_number = EXCLUDED.case_number,
    neutral_citation = EXCLUDED.neutral_citation, judges = EXCLUDED.judges,
    decision_type = EXCLUDED.decision_type, content_sha256 = EXCLUDED.content_sha256,
    metadata_json = EXCLUDED.metadata_json, updated_at = now();

\echo '=== BY YEAR ==='
SELECT extract(year FROM decision_date)::int AS year,
       count(*) FILTER (WHERE source = 'difc') AS difc,
       count(*) FILTER (WHERE source = 'adgm') AS adgm,
       count(*) AS total,
       pg_size_pretty(sum(length(full_text))::bigint) AS text,
       round(avg(length(full_text))) AS avg_chars
FROM ae_court_decisions GROUP BY 1 ORDER BY 1;

\echo '=== BY COURT LEVEL ==='
SELECT source, court_level, count(*) FROM ae_court_decisions GROUP BY 1,2 ORDER BY 1,3 DESC;

\echo '=== TOTALS / QUALITY ==='
SELECT count(*) AS rows,
       count(DISTINCT content_sha256) AS distinct_texts,
       count(*) FILTER (WHERE full_text IS NULL OR length(full_text) < 500) AS thin,
       count(*) FILTER (WHERE decision_date IS NULL) AS no_date,
       count(*) FILTER (WHERE case_number IS NULL) AS no_case_no,
       min(decision_date) AS first, max(decision_date) AS last,
       pg_size_pretty(pg_total_relation_size('ae_court_decisions')) AS table_size
FROM ae_court_decisions;
