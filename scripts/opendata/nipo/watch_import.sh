#!/bin/bash
# Incrementally import the growing NIPO NDJSON tree into prod ip_objects.
# Re-imports (idempotent upsert) every INTERVAL seconds while harvest shards are
# running, then one final pass after they finish.
set -u
DIR=/home/ubuntu/SecondLayer/scripts/opendata/nipo
OUT=${OUT:-/home/ubuntu/nipo_harvest}
LOG=$OUT/logs/import.log
INTERVAL=${INTERVAL:-600}
PW=$(docker exec secondlayer-postgres-prod printenv POSTGRES_PASSWORD)

run_import() {
  cd "$DIR"
  POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5438 POSTGRES_DB=secondlayer_prod \
  POSTGRES_USER=secondlayer POSTGRES_PASSWORD="$PW" \
    python3 import_ndjson.py --harvest-dir "$OUT" --no-schema >> "$LOG" 2>&1
}

echo "=== import watcher started $(date -u +%H:%M:%S) ===" >> "$LOG"
while pgrep -f harvest_nipo.py >/dev/null; do
  run_import
  sleep "$INTERVAL"
done
echo "=== harvest done, final import $(date -u +%H:%M:%S) ===" >> "$LOG"
run_import
echo "=== import watcher finished $(date -u +%H:%M:%S) ===" >> "$LOG"
