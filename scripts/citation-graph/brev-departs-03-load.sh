#!/bin/bash
# =====================================================================
# brev-departs-03-load.sh   (runs ON brev)
# DEPARTS_FROM layer, step 3: load the LLM-confirmed Grand Chamber
# departure edges (gc_departs.csv from departs-02-classify.py) into the
# neo4j-citation graph as (:Decision)-[:DEPARTS_FROM {departed_on}]->(:Case).
#
# Prereqs: main graph already imported (Decision + Case nodes exist),
# and gc_departs.csv (header: doc_id,departed_case,departed_on) copied to
# /data/neo4j/import/gc_departs.csv.
#
#   bash brev-departs-03-load.sh
#
# doc_id and cause_num are STRING keys in the graph (CitationGraphService
# binds String(docId)); MATCH both — never toInteger() (would spawn dup
# nodes). Departures to a case not in the corpus are skipped (no Case node).
# =====================================================================
set -euo pipefail
NEOPW="${NEOPW:-lexCitationBrev7j2026}"
CONTAINER=neo4j-citation
CSV=/data/neo4j/import/gc_departs.csv

[ -f "$CSV" ] || { echo "missing $CSV — run departs-01/02 + relay first"; exit 1; }
echo "rows in csv: $(( $(wc -l < "$CSV") - 1 ))"

docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" <<'CYPHER'
LOAD CSV WITH HEADERS FROM 'file:///gc_departs.csv' AS row
CALL {
  WITH row
  MATCH (d:Decision {doc_id: row.doc_id})
  MATCH (c:Case {cause_num: row.departed_case})
  MERGE (d)-[r:DEPARTS_FROM]->(c)
  SET r.departed_on = row.departed_on
} IN TRANSACTIONS OF 2000 ROWS;
CYPHER

echo "=== DEPARTS_FROM count ==="
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" \
  "MATCH ()-[r:DEPARTS_FROM]->() RETURN count(r) AS departs_from, count(DISTINCT endNode(r)) AS distinct_cases;"
