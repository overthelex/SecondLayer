#!/bin/bash
# =====================================================================
# brev-neo4j-03-import.sh   (runs ON brev)
# Bulk-load the exported CSVs into the neo4j-citation graph via
# `neo4j-admin database import full` (offline, ~minutes at this scale),
# then restart the server and apply schema constraints/indexes.
#
#   bash brev-neo4j-03-import.sh
#
# neo4j-admin needs the DB stopped -> we stop the live container, run the
# import in a throwaway container sharing the same data/import volumes,
# then start the live container back up. --overwrite-destination wipes any
# prior graph (fresh full rebuild).
# =====================================================================
set -euo pipefail

NEOPW="${NEOPW:-lexCitationBrev7j2026}"
DATADIR=/data/neo4j
CONTAINER=neo4j-citation

echo "=== stop live neo4j ==="
docker stop "$CONTAINER"

echo "=== neo4j-admin database import full (throwaway container) ==="
docker run --rm \
  -v $DATADIR/data:/data -v $DATADIR/import:/import -v $DATADIR/logs:/logs \
  neo4j:5 \
  neo4j-admin database import full \
    --overwrite-destination \
    --multiline-fields=true \
    --skip-bad-relationships=true \
    --skip-duplicate-nodes=true \
    --bad-tolerance=5000000 \
    --high-parallel-io=on \
    --threads="$(nproc)" \
    --nodes=Decision=/import/nodes_decision.csv.gz \
    --nodes=Article=/import/nodes_article.csv.gz \
    --nodes=Law=/import/nodes_law.csv.gz \
    --nodes=Case=/import/nodes_case.csv.gz \
    --relationships=CITES_ARTICLE=/import/rels_cites_article.csv.gz \
    --relationships=OF_LAW=/import/rels_of_law.csv.gz \
    --relationships=IN_CASE=/import/rels_in_case.csv.gz \
    --relationships=CITES_CASE=/import/rels_cites_case.csv.gz \
    neo4j

echo "=== start live neo4j ==="
docker start "$CONTAINER"

echo "=== wait for boot ==="
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" "RETURN 1;" >/dev/null 2>&1; then
    echo "up after ${i}0s"; break; fi
  sleep 10
done

echo "=== apply schema (constraints + indexes) ==="
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" <<'CYPHER'
CREATE CONSTRAINT decision_doc_id IF NOT EXISTS FOR (d:Decision) REQUIRE d.doc_id IS UNIQUE;
CREATE CONSTRAINT article_art_id  IF NOT EXISTS FOR (a:Article)  REQUIRE a.art_id IS UNIQUE;
CREATE CONSTRAINT law_law_number  IF NOT EXISTS FOR (l:Law)      REQUIRE l.law_number IS UNIQUE;
CREATE CONSTRAINT case_cause_num  IF NOT EXISTS FOR (c:Case)     REQUIRE c.cause_num IS UNIQUE;
CREATE INDEX article_law_number   IF NOT EXISTS FOR (a:Article)  ON (a.law_number, a.law_article);
CREATE INDEX cites_article_type   IF NOT EXISTS FOR ()-[r:CITES_ARTICLE]-() ON (r.citation_type);
CYPHER

echo "=== graph counts ==="
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" <<'CYPHER'
MATCH (d:Decision) RETURN 'Decision' AS label, count(d) AS n
UNION ALL MATCH (a:Article) RETURN 'Article', count(a)
UNION ALL MATCH (l:Law) RETURN 'Law', count(l)
UNION ALL MATCH (c:Case) RETURN 'Case', count(c);
CYPHER
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" \
  "MATCH ()-[r:CITES_ARTICLE]->() RETURN count(r) AS cites_article;"
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" \
  "MATCH ()-[r:IN_CASE]->() RETURN count(r) AS in_case;"
docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEOPW" \
  "MATCH ()-[r:CITES_CASE]->() RETURN count(r) AS cites_case;"
