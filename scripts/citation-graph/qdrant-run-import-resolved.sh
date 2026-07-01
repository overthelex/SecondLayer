#!/bin/bash
# =====================================================================
# qdrant-run-import-resolved.sh   (runs ON qdrant.lex)   *** DESTRUCTIVE ***
# Full neo4j-admin import of the RESOLVED graph. WIPES the DB and rebuilds
# all layers from the fileset assembled by qdrant-prep-resolved.sh.
# A filesystem backup of the data dir is taken first (rollback below).
#
# Guard: only runs when CONFIRM=yes is set in the environment.
#   CONFIRM=yes ./qdrant-run-import-resolved.sh
#
# Rollback (if import/verify goes wrong):
#   docker stop neo4j && sudo rm -rf /home/ubuntu/neo4j/data \
#     && sudo mv /home/ubuntu/neo4j/data.bak.preresolved /home/ubuntu/neo4j/data \
#     && docker start neo4j
# =====================================================================
set -euo pipefail
[ "${CONFIRM:-no}" = "yes" ] || { echo "Refusing: set CONFIRM=yes to run the destructive import."; exit 1; }
IMP=/import; HOSTIMP=/home/ubuntu/neo4j/import; DATA=/home/ubuntu/neo4j/data
PW=R5r6JBLEVi8NfneX7n6DHn

echo "=== Qdrant health BEFORE ==="; curl -sf localhost:6333/readyz && echo " OK" || echo " (check qdrant port)"

echo "=== stop neo4j ==="; docker stop neo4j

echo "=== backup data dir -> data.bak.preresolved ==="
[ -e "$DATA.bak.preresolved" ] && { echo "backup already exists; aborting to avoid clobber"; docker start neo4j; exit 1; }
cp -a "$DATA" "$DATA.bak.preresolved"
echo "backup size: $(du -sh "$DATA.bak.preresolved" | cut -f1)"

echo "=== neo4j-admin import full (temp container) ==="
docker run --rm --name neo4j-import \
  --memory=28g -e NEO4J_AUTH=none \
  -v "$DATA":/data -v "$HOSTIMP":/import \
  neo4j:5 \
  neo4j-admin database import full \
    --nodes=Decision=$IMP/decisions.csv \
    --nodes=Law=$IMP/laws.csv.gz \
    --nodes=Article=$IMP/articles.csv.gz \
    --nodes=Case=$IMP/cases.csv \
    --relationships=CITES_ARTICLE=$IMP/cites.csv.gz \
    --relationships=OF_LAW=$IMP/of_law.csv.gz \
    --relationships=CITES_CASE=$IMP/cites_case_admin.csv \
    --relationships=DEPARTS_FROM=$IMP/departs_from.csv \
    --id-type=string \
    --skip-bad-relationships=true \
    --skip-duplicate-nodes=true \
    --multiline-fields=true \
    --bad-tolerance=1000000 \
    --overwrite-destination=true \
    --threads=12 \
    neo4j

echo "=== start neo4j ==="; docker start neo4j
echo "=== wait for bolt ==="
for i in $(seq 1 60); do
  docker exec neo4j cypher-shell -u neo4j -p "$PW" "RETURN 1;" >/dev/null 2>&1 && break
  sleep 3
done

echo "=== post-import schema (resolved id-keyed constraints) ==="
docker exec -i neo4j cypher-shell -u neo4j -p "$PW" <<'CYPHER'
CREATE CONSTRAINT decision_doc_id  IF NOT EXISTS FOR (d:Decision) REQUIRE d.doc_id IS UNIQUE;
CREATE CONSTRAINT article_art_id   IF NOT EXISTS FOR (a:Article)  REQUIRE a.art_id IS UNIQUE;
CREATE CONSTRAINT law_legislation_id IF NOT EXISTS FOR (l:Law)    REQUIRE l.legislation_id IS UNIQUE;
CREATE CONSTRAINT case_cause_num   IF NOT EXISTS FOR (c:Case)     REQUIRE c.cause_num IS UNIQUE;
CREATE INDEX article_leg_art IF NOT EXISTS FOR (a:Article) ON (a.legislation_id, a.article_number);
CREATE INDEX cites_type      IF NOT EXISTS FOR ()-[r:CITES_ARTICLE]-() ON (r.citation_type);
CYPHER

echo "=== Qdrant health AFTER ==="; curl -sf localhost:6333/readyz && echo " OK" || echo " (check qdrant)"
echo "IMPORT DONE. Verify counts, then (optionally) rm -rf $DATA.bak.preresolved"
