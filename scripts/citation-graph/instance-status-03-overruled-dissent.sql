-- Phase 2: chain resolution -> overruled lower decisions + dissents.
-- Depends on: instance-status-01-prep.sql (isl_chain) and
--             instance-status-02-extract-disposition.py (edrsr_instance_disposition).
-- Instance codes (edrsr_instances): 1=cassation, 2=appeal, 3=first. Next-lower = instance_code+1.
\timing on
SET statement_timeout = 0;
SET work_mem = '8GB';

-- 1) overruled: each reversed/modified higher decision overrules the merits decision
--    one instance below, in the same case, that predates it (the decision under review).
--    Deterministic tiebreak (low.doc_id DESC) so rebuilds are stable on same-date ties.
DROP TABLE IF EXISTS edrsr_overruled;
CREATE TABLE edrsr_overruled AS
WITH rev AS (
  SELECT DISTINCT ON (d.doc_id)
    low.doc_id           AS doc_id,
    low.instance_code    AS instance_code,
    d.doc_id             AS overruled_by,
    d.instance_code      AS by_instance,
    d.cause_num          AS cause_num,
    d.disposition        AS disposition,
    d.method             AS by_method,
    d.adjudication_date  AS reversed_date
  FROM edrsr_instance_disposition d
  JOIN isl_chain low
    ON low.cause_num     = d.cause_num
   AND low.instance_code = d.instance_code + 1
   AND low.judgment_code IN (1,2,3)                 -- lower merits forms (vyrok/postanova/rishennia)
   AND low.adjudication_date <= d.adjudication_date
  WHERE d.disposition IN ('reversed','modified')
  ORDER BY d.doc_id, low.adjudication_date DESC, low.doc_id DESC
)
SELECT DISTINCT ON (doc_id)
  doc_id, instance_code, overruled_by, by_instance, cause_num, disposition, by_method, reversed_date
FROM rev
ORDER BY doc_id, reversed_date, overruled_by;
ALTER TABLE edrsr_overruled ADD PRIMARY KEY (doc_id);
CREATE INDEX idx_overruled_cause ON edrsr_overruled (cause_num);

-- 2) dissents (okrema dumka = judgment_code 10) attached to same-case same-instance panel merits.
DROP TABLE IF EXISTS edrsr_dissent;
CREATE TABLE edrsr_dissent AS
SELECT DISTINCT dis.doc_id AS dissent_doc_id, dis.cause_num, dis.instance_code,
       m.doc_id AS parent_doc_id
FROM isl_chain dis
JOIN isl_chain m
  ON m.cause_num = dis.cause_num
 AND m.instance_code = dis.instance_code
 AND m.judgment_code IN (2,3)
 AND m.doc_id <> dis.doc_id
WHERE dis.judgment_code = 10;
CREATE INDEX idx_dissent_parent ON edrsr_dissent (parent_doc_id);

SELECT (SELECT count(*) FROM edrsr_overruled) AS overruled_docs,
       (SELECT count(*) FROM edrsr_overruled WHERE disposition='reversed') AS by_reversed,
       (SELECT count(*) FROM edrsr_overruled WHERE disposition='modified') AS by_modified,
       (SELECT count(DISTINCT dissent_doc_id) FROM edrsr_dissent) AS dissent_docs;
