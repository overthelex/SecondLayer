#!/usr/bin/env bash
# Parallel crawl of ZakonOnline court_sessions API
# Usage: ./scripts/hudoc/crawl-zo-parallel.sh [start_date] [end_date] [workers]
#   Default: 2021-02-01 to 2026-03-03, 3 workers
#
# Each worker crawls its own date chunk independently.
# Dedup via ON CONFLICT (id) DO NOTHING.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="postgres-hudoc-local"
DB_USER="${HUDOC_POSTGRES_USER:-hudoc}"
DB_NAME="${HUDOC_POSTGRES_DB:-hudoc_local}"
WORKERS="${3:-3}"

# Load ZO tokens
ENV_FILE="${SCRIPT_DIR}/../../deployment/.env.local"
ZO_TOKEN=$(grep '^ZAKONONLINE_API_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2)
ZO_TOKEN2=$(grep '^ZAKONONLINE_API_TOKEN2=' "$ENV_FILE" | head -1 | cut -d= -f2 || echo "")

END_DATE="${2:-2026-03-03}"
START_DATE="${1:-2021-02-01}"

ZO_BASE="https://court.searcher.api.zakononline.com.ua/v1/court_sessions/search"
LIMIT=1000

echo "=== ZO Parallel Crawler ==="
echo "Range: $START_DATE → $END_DATE | Workers: $WORKERS"
echo ""

# Calculate date chunks
start_epoch=$(date -d "$START_DATE" +%s)
end_epoch=$(date -d "$END_DATE" +%s)
total_days=$(( (end_epoch - start_epoch) / 86400 + 1 ))
chunk_size=$(( total_days / WORKERS ))

echo "Total days: $total_days | Chunk: ~$chunk_size days/worker"

# Unique prefix to avoid conflicts when running multiple instances
RUN_ID="$$"

# Ensure staging tables exist
for i in $(seq 0 $((WORKERS - 1))); do
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
    "CREATE TABLE IF NOT EXISTS _cs_stg_${RUN_ID}_${i} (LIKE court_sessions INCLUDING DEFAULTS);" 2>/dev/null
done

# Cleanup on exit
cleanup() {
  for i in $(seq 0 $((WORKERS - 1))); do
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c "DROP TABLE IF EXISTS _cs_stg_${RUN_ID}_${i};" 2>/dev/null
  done
}
trap cleanup EXIT

# Worker function
crawl_worker() {
  local worker_id=$1
  local w_start=$2
  local w_end=$3
  local stg_table="_cs_stg_${RUN_ID}_${worker_id}"
  local state_file="${SCRIPT_DIR}/.crawl-state-${RUN_ID}-w${worker_id}"
  local log_file="${SCRIPT_DIR}/crawl-${RUN_ID}-w${worker_id}.log"

  # Alternate tokens per worker
  local tokens=("$ZO_TOKEN")
  [ -n "${ZO_TOKEN2:-}" ] && tokens+=("$ZO_TOKEN2")
  local tidx=$worker_id

  # Resume support
  if [ -f "$state_file" ]; then
    w_start=$(cat "$state_file")
    echo "[W$worker_id] Resuming from $w_start" | tee -a "$log_file"
  fi

  echo "[W$worker_id] $w_start → $w_end" | tee -a "$log_file"

  local current="$w_start"
  local w_total=0
  local w_days=0
  local w_start_ts=$(date +%s)

  while [[ "$current" < "$w_end" || "$current" == "$w_end" ]]; do
    local day_count=0
    local page=1

    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c "TRUNCATE ${stg_table};" 2>/dev/null

    while true; do
      local token="${tokens[$((tidx % ${#tokens[@]}))]}"
      tidx=$((tidx + 1))

      local resp
      resp=$(curl -sf --max-time 30 \
        "${ZO_BASE}?target=case_involved&limit=${LIMIT}&page=${page}&order%5Bdate_session%5D=asc&where%5Bdate_session%5D%5Bop%5D=between&where%5Bdate_session%5D%5Bvalue%5D%5B0%5D=${current}&where%5Bdate_session%5D%5Bvalue%5D%5B1%5D=${current}" \
        -H "X-App-Token: $token" \
        -H "Accept: application/json" 2>/dev/null || echo "[]")

      local cnt
      cnt=$(echo "$resp" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

      [ "$cnt" -eq 0 ] && break

      echo "$resp" | python3 -c "
import json, sys, csv, io
data = json.load(sys.stdin)
out = io.StringIO()
w = csv.writer(out, delimiter='\t', quoting=csv.QUOTE_MINIMAL)
for r in data:
    w.writerow([
        r.get('id',''), r.get('title',''), r.get('court_code',''),
        r.get('court_id',0), r.get('justice_kind',''), r.get('cause_num',''),
        r.get('court_room') or '', r.get('case_description',''),
        r.get('judges',''), r.get('case_involved',''),
        r.get('date_session',''), r.get('date_session_source',''),
        r.get('judges_rel',''), r.get('url',''), 'zo'
    ])
print(out.getvalue(), end='')
" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
        "COPY ${stg_table} (id,title,court_code,court_id,justice_kind,cause_num,court_room,case_description,judges,case_involved,date_session,date_session_source,judges_rel,url,source) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t')" \
        2>/dev/null

      day_count=$((day_count + cnt))
      page=$((page + 1))
      sleep 0.150
    done

    if [ "$day_count" -gt 0 ]; then
      docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
        "INSERT INTO court_sessions SELECT * FROM ${stg_table} ON CONFLICT (id) DO NOTHING;" 2>/dev/null
    fi

    w_total=$((w_total + day_count))
    w_days=$((w_days + 1))
    echo "$current" > "$state_file"

    if [ $((w_days % 30)) -eq 0 ]; then
      local elapsed=$(( $(date +%s) - w_start_ts ))
      local rate=$( [ $elapsed -gt 0 ] && echo "$((w_total / elapsed))" || echo "0" )
      echo "[W$worker_id] $current | day $w_days | total: ${w_total} | ${rate}/sec" | tee -a "$log_file"
    fi

    current=$(date -d "$current + 1 day" +%Y-%m-%d)
  done

  local elapsed=$(( $(date +%s) - w_start_ts ))
  echo "[W$worker_id] DONE | $w_days days | $w_total records | ${elapsed}s" | tee -a "$log_file"
  rm -f "$state_file"
}

# Launch workers
pids=()
for i in $(seq 0 $((WORKERS - 1))); do
  chunk_start_epoch=$((start_epoch + i * chunk_size * 86400))
  if [ $i -eq $((WORKERS - 1)) ]; then
    chunk_end_epoch=$end_epoch
  else
    chunk_end_epoch=$((start_epoch + (i + 1) * chunk_size * 86400 - 86400))
  fi
  cs=$(date -d "@$chunk_start_epoch" +%Y-%m-%d)
  ce=$(date -d "@$chunk_end_epoch" +%Y-%m-%d)

  crawl_worker $i "$cs" "$ce" &
  pids+=($!)
  echo "Launched W$i (PID ${pids[-1]}): $cs → $ce"
done

echo ""
echo "PIDs: ${pids[*]}"
echo "${pids[*]}" > "$SCRIPT_DIR/.crawl-pids"

# Wait for all
for pid in "${pids[@]}"; do
  wait "$pid" || echo "Worker PID $pid exited with error"
done

# Cleanup staging tables (also handled by trap)
cleanup

rm -f "$SCRIPT_DIR/.crawl-pids"

echo ""
echo "=== All Workers Complete ==="
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
SELECT
    COUNT(*) AS total_rows,
    MIN(date_session)::date AS earliest,
    MAX(date_session)::date AS latest,
    COUNT(DISTINCT court_code) AS courts,
    COUNT(DISTINCT justice_kind) AS justice_kinds,
    pg_size_pretty(pg_total_relation_size('court_sessions')) AS table_size
FROM court_sessions;
SQL
