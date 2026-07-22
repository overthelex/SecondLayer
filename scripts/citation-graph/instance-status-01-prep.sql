\timing on
SET statement_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET work_mem = '8GB';
SET max_parallel_workers_per_gather = 8;

\echo '===== 1) multi-instance cause_num set (>=2 distinct instances) ====='
DROP TABLE IF EXISTS isl_multi_cases;
CREATE UNLOGGED TABLE isl_multi_cases AS
SELECT d.cause_num
FROM edrsr_documents d
JOIN edrsr_courts c ON c.court_code = d.court_code
WHERE d.cause_num IS NOT NULL AND d.cause_num <> ''
GROUP BY d.cause_num
HAVING count(DISTINCT c.instance_code) >= 2;
ALTER TABLE isl_multi_cases ADD PRIMARY KEY (cause_num);
SELECT count(*) AS multi_cases FROM isl_multi_cases;

\echo '===== 2) chain: all docs of those cases with instance + form ====='
DROP TABLE IF EXISTS isl_chain;
CREATE UNLOGGED TABLE isl_chain AS
SELECT d.doc_id, d.cause_num, c.instance_code, d.judgment_code,
       d.adjudication_date
FROM edrsr_documents d
JOIN edrsr_courts c ON c.court_code = d.court_code
JOIN isl_multi_cases m ON m.cause_num = d.cause_num;
CREATE INDEX idx_isl_chain_cause ON isl_chain (cause_num);
CREATE INDEX idx_isl_chain_doc   ON isl_chain (doc_id);
SELECT count(*) AS chain_docs FROM isl_chain;

\echo '===== 3) shape of the classification target: instance x form in chains ====='
SELECT instance_code, judgment_code, count(*) AS n
FROM isl_chain
GROUP BY 1,2
ORDER BY 1,2;

\echo '===== DONE_PREP ====='
