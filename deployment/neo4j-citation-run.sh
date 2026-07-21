#!/usr/bin/env bash
# neo4j-citation-run.sh
#
# (Re)creates the neo4j-citation container on PROD. This container is NOT in any
# compose file: the store is a 168G bind mount migrated from Brev on 2026-07-20
# (see /home/ubuntu/neo4j-migrate.sh), so it is deliberately outside the blue-green
# deploy. It was previously started by an ad-hoc `docker run` that existed nowhere,
# which is how NEO4J_db_transaction_timeout=5s ended up as undocumented prod state.
# Recreate it ONLY through this script so the config stays reviewable.
#
# Recreating is safe for the data: /data is a bind mount, the container is disposable.
# Impact: the citation graph is down for the restart. Backend callers degrade to
# logger.warn; get_citation_graph returns a user-facing error for that window.
#
# Usage (on prod):
#   bash neo4j-citation-run.sh                 # normal serving config
#   TX_TIMEOUT=600s bash neo4j-citation-run.sh # maintenance window for a backfill
#
# TX_TIMEOUT is a backstop against runaway queries, NOT a latency fix. The serving
# path must be fast on its own: precedent in-degree is read from the materialized
# Case.cited_by_count, never counted at query time (LEXAI-1777).
# The case-layer backfill/maintenance statement scans every CITES_CASE edge in one
# transaction and needs TX_TIMEOUT=600s -- see
# scripts/citation-graph/backfill-case-cited-by-count.cypher.
set -euo pipefail

NAME=neo4j-citation
IMAGE=neo4j@sha256:4bae36aff76271e27fd6a6ed0835413f86a284cd179cfb1cb7d188f5f7533aca  # neo4j 5.26.28 community
DATA=/home/ubuntu/neo4j-citation/data
NETWORK=deployment_secondlayer-prod-network
TX_TIMEOUT="${TX_TIMEOUT:-30s}"

if [ ! -d "$DATA/databases/neo4j" ]; then
  echo "FATAL: $DATA/databases/neo4j missing -- refusing to start on an empty store." >&2
  exit 1
fi

echo "=== recreating $NAME (db.transaction.timeout=$TX_TIMEOUT) ==="
docker rm -f "$NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  --network "$NETWORK" \
  --memory 26g \
  -p 127.0.0.1:7474:7474 \
  -p 127.0.0.1:7687:7687 \
  -v "$DATA":/data \
  -e NEO4J_server_default__listen__address=0.0.0.0 \
  -e NEO4J_server_memory_heap_initial__size=8g \
  -e NEO4J_server_memory_heap_max__size=8g \
  -e NEO4J_server_memory_pagecache_size=12g \
  -e NEO4J_db_transaction_timeout="$TX_TIMEOUT" \
  "$IMAGE"

echo "=== waiting for bolt ==="
for i in $(seq 1 60); do
  if docker exec -i "$NAME" cypher-shell -u neo4j -p "${NEOPW:?set NEOPW}" \
       --format plain "RETURN 1;" >/dev/null 2>&1; then
    echo "up after ${i}s"
    docker exec -i "$NAME" cypher-shell -u neo4j -p "$NEOPW" --format plain \
      "SHOW SETTINGS YIELD name, value WHERE name = 'db.transaction.timeout' RETURN name, value;"
    exit 0
  fi
  sleep 1
done
echo "FATAL: bolt did not come up within 60s" >&2
docker logs --tail 40 "$NAME" >&2
exit 1
