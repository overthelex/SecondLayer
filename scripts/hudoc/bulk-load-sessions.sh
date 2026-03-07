#!/bin/bash
# Bulk load court-sessions-revisions CSVs into PG staging table.
# Phase 1: parallel COPY into staging (no indexes)
# Phase 2: deduplicate into court_sessions
#
# Usage: bash scripts/hudoc/bulk-load-sessions.sh [workers] [data_dir]

set -euo pipefail

WORKERS=${1:-50}
DATA_DIR="${2:-/media/vovkes/bulk-storage/court-sessions-revisions}"
DB_CONN="postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local"
DB_CONTAINER="secondlayer-postgres-local"
DB_USER="secondlayer"
DB_NAME="secondlayer_local"

# Helper: run SQL via docker exec
run_sql() {
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "=== Bulk Load Court Sessions ==="
echo "  Workers:  $WORKERS"
echo "  Data dir: $DATA_DIR"

# List CSV files sorted
mapfile -t CSV_FILES < <(find "$DATA_DIR" -maxdepth 1 -name '*.csv' -printf '%f\n' | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.csv$' | sort)
TOTAL=${#CSV_FILES[@]}
echo "  CSV files: $TOTAL"
echo ""

START_TIME=$(date +%s)
DONE=0
ERRORS=0

# Function to load one file
load_one() {
  local filename="$1"
  local revision_date="${filename%.csv}"
  local filepath="${DATA_DIR}/${filename}"

  tail -n +2 "$filepath" \
    | tr -d '\r' \
    | sed "s/^/${revision_date}\t/" \
    | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
      "COPY court_sessions_staging (revision_date, session_datetime, judges, case_number, court_name, court_room, case_involved, case_description) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', QUOTE '\"')" \
    2>/dev/null
}

# Process in parallel using background jobs
RUNNING=0
for filename in "${CSV_FILES[@]}"; do
  load_one "$filename" &
  RUNNING=$((RUNNING + 1))

  # Throttle to WORKERS concurrent jobs
  if [ "$RUNNING" -ge "$WORKERS" ]; then
    wait -n 2>/dev/null || true
    RUNNING=$((RUNNING - 1))
    DONE=$((DONE + 1))

    # Progress every 20 files
    if [ $((DONE % 20)) -eq 0 ]; then
      ELAPSED=$(( $(date +%s) - START_TIME ))
      FPS=$(echo "scale=1; $DONE / ($ELAPSED + 1)" | bc)
      ETA=$(echo "scale=0; ($TOTAL - $DONE) / ($FPS + 0.01)" | bc 2>/dev/null || echo "?")
      echo "[COPY] $DONE/$TOTAL files | ${FPS} f/s | ${ELAPSED}s elapsed | ETA ~${ETA}s"
    fi
  fi
done

# Wait for remaining jobs
wait
DONE=$TOTAL

COPY_END=$(date +%s)
COPY_ELAPSED=$((COPY_END - START_TIME))

echo ""
echo "=== COPY phase complete in ${COPY_ELAPSED}s ==="

# Count staging rows
STAGING_COUNT=$(run_sql -t -c "SELECT count(*) FROM court_sessions_staging;")
echo "  Staging rows: $STAGING_COUNT"

echo ""
echo "=== Phase 2: Deduplicating into court_sessions ==="

run_sql -c "
  INSERT INTO court_sessions (
    id, case_number, court_name, judge_name, session_date, session_time,
    session_place, involved_parties, first_seen_date, last_seen_date,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    case_number,
    court_name,
    judges,
    CASE
      WHEN session_datetime ~ '^\d{2}\.\d{2}\.\d{4}' THEN
        to_date(substring(session_datetime from 1 for 10), 'DD.MM.YYYY')
      ELSE NULL
    END,
    CASE
      WHEN session_datetime ~ '\d{2}:\d{2}' THEN
        substring(session_datetime from '\d{2}:\d{2}')
      ELSE NULL
    END,
    NULLIF(court_room, ''),
    NULLIF(case_involved, ''),
    MIN(revision_date),
    MAX(revision_date),
    NOW(),
    NOW()
  FROM court_sessions_staging
  WHERE case_number IS NOT NULL
    AND case_number != ''
  GROUP BY
    case_number, court_name, judges, session_datetime, court_room, case_involved
  ON CONFLICT (case_number, session_date, court_name, judge_name)
  DO UPDATE SET
    last_seen_date = GREATEST(court_sessions.last_seen_date, EXCLUDED.last_seen_date),
    first_seen_date = LEAST(court_sessions.first_seen_date, EXCLUDED.first_seen_date),
    updated_at = NOW();
"

DEDUP_END=$(date +%s)
DEDUP_ELAPSED=$((DEDUP_END - COPY_END))

FINAL_COUNT=$(run_sql -t -c "SELECT count(*) FROM court_sessions;")
echo "  Dedup: ${DEDUP_ELAPSED}s"
echo "  Final rows: $FINAL_COUNT"

echo ""
echo "=== Cleanup ==="
run_sql -c "
  ALTER TABLE court_sessions SET LOGGED;
  DROP TABLE court_sessions_staging;
"

TOTAL_TIME=$(( $(date +%s) - START_TIME ))
echo ""
echo "=== Done in ${TOTAL_TIME}s ==="
echo "  Total rows in court_sessions: $FINAL_COUNT"
