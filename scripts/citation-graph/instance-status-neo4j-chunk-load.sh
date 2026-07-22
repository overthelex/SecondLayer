#!/bin/bash
# Phase 3 loader: chunk an overruled CSV into sub-5s pieces and MERGE each into the
# neo4j-citation graph (works around Neo4j Community + db.transaction.timeout=5s, which
# cannot be raised at runtime). MERGE is idempotent, so re-runs are safe.
#
# Usage: instance-status-neo4j-chunk-load.sh <csv_on_host> [chunk_rows] [rel_method]
#   <csv_on_host>  host path to an edrsr_overruled(_delta).csv (header: doc_id,instance_code,
#                  overruled_by,by_instance,cause_num,disposition,reversed_date)
#   [chunk_rows]   rows per chunk (default 2500)
#   [rel_method]   optional value written to r.method (e.g. llm_qwen) for delta loads
# Env: NEO4J_PASS (required), NEO4J_CONTAINER (default neo4j-citation)
set -euo pipefail
CSV="${1:?usage: <csv_on_host> [chunk_rows] [rel_method]}"
ROWS="${2:-2500}"
METHOD="${3:-}"
CONT="${NEO4J_CONTAINER:-neo4j-citation}"
P="${NEO4J_PASS:?set NEO4J_PASS}"
NAME="$(basename "$CSV" .csv)"
WORK="/tmp/${NAME}_chunks"

rm -rf "$WORK" && mkdir -p "$WORK"
HDR="$(head -1 "$CSV")"
tail -n +2 "$CSV" | split -l "$ROWS" - "$WORK/part_"
for f in "$WORK"/part_*; do (echo "$HDR"; cat "$f") > "$f.csv"; rm "$f"; done
echo "chunks: $(ls "$WORK" | wc -l)"

docker exec "$CONT" rm -rf "/var/lib/neo4j/import/$NAME"
docker cp "$WORK" "$CONT:/var/lib/neo4j/import/$NAME"
docker exec "$CONT" chown -R neo4j:neo4j "/var/lib/neo4j/import/$NAME"

SETM=""
[ -n "$METHOD" ] && SETM=", r.method='$METHOD'"
ERR="/tmp/${NAME}.err"; : > "$ERR"
for f in $(docker exec "$CONT" bash -c "ls /var/lib/neo4j/import/$NAME/"); do
  docker exec "$CONT" cypher-shell -u neo4j -p "$P" \
    "LOAD CSV WITH HEADERS FROM 'file:///$NAME/$f' AS row \
     MATCH (low:Decision {doc_id: row.doc_id}) MATCH (high:Decision {doc_id: row.overruled_by}) \
     SET low.status='overruled' MERGE (low)-[r:SUPERSEDED_BY]->(high) \
     SET r.disposition=row.disposition, r.reversed_date=row.reversed_date$SETM;" \
    >/dev/null 2>>"$ERR" || echo "FAIL $f" >>"$ERR"
done
echo "fails: $(grep -c FAIL "$ERR" || true)"
docker exec "$CONT" cypher-shell -u neo4j -p "$P" --format plain \
  "MATCH ()-[r:SUPERSEDED_BY]->() RETURN count(r) AS superseded_by_total;"
