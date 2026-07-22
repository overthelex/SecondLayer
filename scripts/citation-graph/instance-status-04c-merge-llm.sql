\timing on
SET statement_timeout=0; SET work_mem='8GB';

\echo '===== rebuild overruled v2 DETERMINISTIC (tiebreak low.doc_id) + carry reverser method ====='
DROP TABLE IF EXISTS edrsr_overruled_v2;
CREATE TABLE edrsr_overruled_v2 AS
WITH rev AS (
  SELECT DISTINCT ON (d.doc_id)
    low.doc_id AS doc_id, low.instance_code AS instance_code,
    d.doc_id AS overruled_by, d.instance_code AS by_instance,
    d.cause_num, d.disposition, d.method AS by_method,
    d.adjudication_date AS reversed_date
  FROM edrsr_instance_disposition d
  JOIN isl_chain low ON low.cause_num=d.cause_num AND low.instance_code=d.instance_code+1
    AND low.judgment_code IN (1,2,3) AND low.adjudication_date<=d.adjudication_date
  WHERE d.disposition IN ('reversed','modified')
  ORDER BY d.doc_id, low.adjudication_date DESC, low.doc_id DESC
)
SELECT DISTINCT ON (doc_id) doc_id,instance_code,overruled_by,by_instance,cause_num,disposition,by_method,reversed_date
FROM rev ORDER BY doc_id, reversed_date, overruled_by;
ALTER TABLE edrsr_overruled_v2 ADD PRIMARY KEY(doc_id);

\echo '===== clean delta = newly overruled (not in graph v1) AND reverser is LLM-recovered ====='
DROP TABLE IF EXISTS edrsr_overruled_delta;
CREATE TABLE edrsr_overruled_delta AS
SELECT v2.doc_id, v2.instance_code, v2.overruled_by, v2.by_instance,
       v2.cause_num, v2.disposition, v2.reversed_date
FROM edrsr_overruled_v2 v2
LEFT JOIN edrsr_overruled v1 ON v1.doc_id=v2.doc_id
WHERE v1.doc_id IS NULL AND v2.by_method='llm_qwen';

SELECT (SELECT count(*) FROM edrsr_overruled)        AS v1_in_graph,
       (SELECT count(*) FROM edrsr_overruled_v2)     AS v2_total,
       (SELECT count(*) FROM edrsr_overruled_delta)  AS delta_llm_new,
       (SELECT count(*) FROM edrsr_instance_disposition WHERE method='llm_qwen' AND disposition IN ('reversed','modified')) AS llm_reversers;
\echo '===== DONE_MERGE2 ====='
