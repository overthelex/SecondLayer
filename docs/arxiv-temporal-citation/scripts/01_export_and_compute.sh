#!/bin/bash
# Step 1: Export PostgreSQL → Parquet → DuckDB temporal cocitation
# Prerequisites: DuckDB CLI installed, PostgreSQL running in Docker
set -euo pipefail

OUTDIR="/tmp/citation-analysis"
DUCKDB="${HOME}/.duckdb/cli/latest/duckdb"

echo "=== Step 1: Export from PostgreSQL ==="
echo "Exporting citations..."
docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local \
  -c "COPY (SELECT court_case_id, law_number, law_article, citation_type FROM law_court_citations) TO STDOUT WITH (FORMAT csv, HEADER)" \
  > "${OUTDIR}/citations.csv"

echo "Exporting documents..."
docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local \
  -c "COPY ($(for y in $(seq 2005 2026); do echo "SELECT doc_id, EXTRACT(YEAR FROM adjudication_date)::INT as adj_year, justice_kind, court_code FROM edrsr_documents_p_${y}"; [ $y -lt 2026 ] && echo "UNION ALL"; done)) TO STDOUT WITH (FORMAT csv, HEADER)" \
  > "${OUTDIR}/documents.csv"

echo "=== Step 2: Convert to Parquet ==="
$DUCKDB -c "
COPY (SELECT * FROM read_csv('${OUTDIR}/citations.csv', header=true,
  columns={'court_case_id':'BIGINT','law_number':'VARCHAR','law_article':'VARCHAR','citation_type':'VARCHAR'}))
TO '${OUTDIR}/citations.parquet' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 1000000);
"

$DUCKDB -c "
COPY (SELECT * FROM read_csv('${OUTDIR}/documents.csv', header=true,
  columns={'doc_id':'BIGINT','adj_year':'SMALLINT','justice_kind':'SMALLINT','court_code':'INTEGER'}))
TO '${OUTDIR}/documents.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
"

echo "=== Step 3: Temporal cocitation (DuckDB) ==="
$DUCKDB "${OUTDIR}/analysis.duckdb" -c "
SET threads TO 16;
SET memory_limit = '80GB';

CREATE OR REPLACE TABLE cited_p AS
SELECT c.court_case_id, c.law_number, c.law_article,
  CASE
    WHEN d.adj_year BETWEEN 2007 AND 2013 THEN 1
    WHEN d.adj_year BETWEEN 2014 AND 2016 THEN 2
    WHEN d.adj_year BETWEEN 2017 AND 2019 THEN 3
    WHEN d.adj_year BETWEEN 2020 AND 2021 THEN 4
    WHEN d.adj_year BETWEEN 2022 AND 2026 THEN 5
  END AS period
FROM '${OUTDIR}/citations.parquet' c
JOIN '${OUTDIR}/documents.parquet' d ON c.court_case_id = d.doc_id
WHERE d.adj_year BETWEEN 2007 AND 2026;
"

for P in 1 2 3 4 5; do
  echo "Computing cocitation for period ${P}..."
  $DUCKDB "${OUTDIR}/analysis.duckdb" -c "
  SET threads TO 16;
  SET memory_limit = '80GB';
  COPY (
    SELECT a.law_number AS law_a, a.law_article AS art_a,
           b.law_number AS law_b, b.law_article AS art_b,
           ${P} AS period,
           COUNT(DISTINCT a.court_case_id) AS weight
    FROM cited_p a
    JOIN cited_p b ON a.court_case_id = b.court_case_id
      AND a.period = ${P} AND b.period = ${P}
      AND (a.law_number, a.law_article) < (b.law_number, b.law_article)
    WHERE a.period = ${P}
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(DISTINCT a.court_case_id) >= 10
  ) TO '${OUTDIR}/cocitation_p${P}.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
  "
done

echo "=== Done ==="
ls -lh ${OUTDIR}/cocitation_p*.parquet
