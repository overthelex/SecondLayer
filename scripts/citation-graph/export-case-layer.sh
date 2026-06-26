#!/usr/bin/env bash
# export-case-layer.sh  (LEXAI-1777)
#
# Exports the decision<->decision Case layer from PROD Postgres into CSVs for an
# ONLINE additive load into the live Neo4j graph on qdrant.lex (LOAD CSV, no wipe).
# Source tables built by build-case-citation-links.sql (edrsr_case_index + case_citation_links).
#
# Output (gzipped, ~0.8G total): cases.csv.gz + cites_case.csv.gz
#   cases.csv       : cause_num, member_count, latest_doc_id        -> (:Case) nodes
#   cites_case.csv  : from_doc_id, cause_num                        -> (:Decision)-[:CITES_CASE]->(:Case)
#                     (resolved precedent edges only; self-citations excluded as noise)
#
# Run ON PROD:  bash export-case-layer.sh   ->  /tmp/case-layer/*.csv.gz
set -euo pipefail
OUT=/tmp/case-layer
mkdir -p "$OUT"
PSQL="docker exec -i secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod -v ON_ERROR_STOP=1 -q"

echo "=== cases.csv (Case nodes from edrsr_case_index) ==="
$PSQL -c "\copy (
  SELECT cause_num, member_count, latest_doc_id
  FROM edrsr_case_index
) TO STDOUT WITH (FORMAT csv, HEADER true, FORCE_QUOTE (cause_num))" | gzip > "$OUT/cases.csv.gz"

echo "=== cites_case.csv (CITES_CASE precedent edges; resolved, non-self) ==="
$PSQL -c "\copy (
  SELECT from_doc_id, to_case_number AS cause_num
  FROM case_citation_links
  WHERE resolved AND NOT is_self_citation
) TO STDOUT WITH (FORMAT csv, HEADER true, FORCE_QUOTE (cause_num))" | gzip > "$OUT/cites_case.csv.gz"

echo "=== sizes ==="
ls -lh "$OUT"/*.csv.gz
echo "DONE. Transfer to qdrant.lex:/home/ubuntu/neo4j/import/ then run load-case-layer.cypher"
