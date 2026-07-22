\timing on
\set ON_ERROR_STOP off
SET statement_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET work_mem = '8GB';

\echo '===== Q1: total docs ====='
SELECT count(*) AS total_docs FROM edrsr_documents;

\echo '===== Q2: instance x judgment_code crosstab (join to courts) ====='
SELECT c.instance_code, c.name AS instance_name, d.judgment_code, count(*) AS n
FROM edrsr_documents d
LEFT JOIN edrsr_courts c ON d.court_code = c.court_code
GROUP BY 1,2,3
ORDER BY 1,3;

\echo '===== Q3: identify judgment_code for OKREMA DUMKA (sample text per code) ====='
-- for each judgment_code take one doc, check if full_text contains ОКРЕМА ДУМКА header
SELECT jc.judgment_code,
       (SELECT left(f.full_text, 120)
          FROM edrsr_documents d2
          JOIN edrsr_fulltext f ON f.doc_id = d2.doc_id
         WHERE d2.judgment_code = jc.judgment_code
         LIMIT 1) AS sample_head
FROM (SELECT DISTINCT judgment_code FROM edrsr_documents) jc
ORDER BY 1;

\echo '===== Q4: multi-instance case distribution (HEAVY: group by cause_num over full corpus) ====='
SELECT instances_per_case, count(*) AS n_cases
FROM (
  SELECT d.cause_num, count(DISTINCT c.instance_code) AS instances_per_case
  FROM edrsr_documents d
  JOIN edrsr_courts c ON d.court_code = c.court_code
  WHERE d.cause_num IS NOT NULL AND d.cause_num <> ''
  GROUP BY d.cause_num
) t
GROUP BY 1
ORDER BY 1;

\echo '===== Q5: disposition-marker sample on 2023 appeal+cassation (reversal-rate estimate) ====='
-- tail-slice regex; APPROXIMATE (real extraction anchors on operative-part marker)
WITH samp AS (
  SELECT right(f.full_text, 2500) AS tail
  FROM edrsr_fulltext f
  JOIN edrsr_documents d ON d.doc_id = f.doc_id
  JOIN edrsr_courts c ON d.court_code = c.court_code
  WHERE f.adj_year = 2023 AND c.instance_code IN (1,2)
  LIMIT 100000
)
SELECT
  count(*) AS sampled,
  count(*) FILTER (WHERE tail ~* 'залишити' AND tail ~* 'без змін') AS affirmed,
  count(*) FILTER (WHERE tail ~* 'скасувати')                        AS has_skasuvaty,
  count(*) FILTER (WHERE tail ~* 'змінити')                          AS has_zminyty
FROM samp;

\echo '===== Q6: okrema dumka count via judgment_code candidates (text-verified) ====='
-- count docs whose full_text starts with ОКРЕМА ДУМКА, sampled per year is expensive;
-- instead count by judgment_code once Q3 identifies the code (reported in Q2 already).
\echo 'see Q2/Q3 for okrema dumka code + count'

\echo '===== DONE ====='
