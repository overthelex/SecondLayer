#!/usr/bin/env bash
# Crawl ZakonOnline court_sessions API day-by-day and insert into HUDOC PG
# Usage: ./scripts/hudoc/crawl-zo-sessions.sh [start_date] [end_date]
#   Default: 5 years back from today
#
# Rate: ~5 req/sec (200ms delay), ~19 pages/day, ~2s per day
# Estimate: 5 years ≈ 1825 days × 19 pages = ~35K requests ≈ ~2 hours

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="postgres-hudoc-local"
DB_USER="${HUDOC_POSTGRES_USER:-hudoc}"
DB_NAME="${HUDOC_POSTGRES_DB:-hudoc_local}"

# Load ZO tokens from .env.local
ENV_FILE="${SCRIPT_DIR}/../../deployment/.env.local"
if [ -f "$ENV_FILE" ]; then
  ZO_TOKEN=$(grep '^ZAKONONLINE_API_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2)
  ZO_TOKEN2=$(grep '^ZAKONONLINE_API_TOKEN2=' "$ENV_FILE" | head -1 | cut -d= -f2 || echo "")
else
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

# Date range
END_DATE="${2:-$(date +%Y-%m-%d)}"
START_DATE="${1:-$(date -d "$END_DATE - 5 years" +%Y-%m-%d)}"

ZO_BASE="https://court.searcher.api.zakononline.com.ua/v1/court_sessions/search"
LIMIT=1000
DELAY_MS=200
TOKEN_IDX=0
TOKENS=("$ZO_TOKEN")
[ -n "${ZO_TOKEN2:-}" ] && TOKENS+=("$ZO_TOKEN2")

# State file for resume
STATE_FILE="$SCRIPT_DIR/.crawl-state"
if [ -f "$STATE_FILE" ]; then
  RESUME_DATE=$(cat "$STATE_FILE")
  echo "Resuming from $RESUME_DATE (state file found)"
  START_DATE="$RESUME_DATE"
fi

echo "=== ZO Court Sessions Crawler ==="
echo "Date range: $START_DATE → $END_DATE"
echo "Tokens: ${#TOKENS[@]}"
echo "Target: $CONTAINER / $DB_NAME"
echo ""

get_token() {
  echo "${TOKENS[$TOKEN_IDX]}"
  TOKEN_IDX=$(( (TOKEN_IDX + 1) % ${#TOKENS[@]} ))
}

# Staging table (persistent, not temp)
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q <<'SQL'
CREATE TABLE IF NOT EXISTS _cs_staging (LIKE court_sessions INCLUDING DEFAULTS);
SQL

total_inserted=0
total_days=0
start_ts=$(date +%s)

current="$START_DATE"
while [[ "$current" < "$END_DATE" || "$current" == "$END_DATE" ]]; do
  day_inserted=0
  page=1

  # Truncate staging for this day
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c "TRUNCATE _cs_staging;" 2>/dev/null

  while true; do
    token=$(get_token)

    # Fetch page
    response=$(curl -sf --max-time 30 \
      "${ZO_BASE}?target=case_involved&limit=${LIMIT}&page=${page}&order%5Bdate_session%5D=asc&where%5Bdate_session%5D%5Bop%5D=between&where%5Bdate_session%5D%5Bvalue%5D%5B0%5D=${current}&where%5Bdate_session%5D%5Bvalue%5D%5B1%5D=${current}" \
      -H "X-App-Token: $token" \
      -H "Accept: application/json" 2>/dev/null || echo "[]")

    count=$(echo "$response" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

    if [ "$count" -eq 0 ]; then
      break
    fi

    # Generate TSV and COPY into staging
    echo "$response" | python3 -c "
import json, sys, csv, io
data = json.load(sys.stdin)
out = io.StringIO()
w = csv.writer(out, delimiter='\t', quoting=csv.QUOTE_MINIMAL)
for r in data:
    w.writerow([
        r.get('id', ''),
        r.get('title', ''),
        r.get('court_code', ''),
        r.get('court_id', 0),
        r.get('justice_kind', ''),
        r.get('cause_num', ''),
        r.get('court_room') or '',
        r.get('case_description', ''),
        r.get('judges', ''),
        r.get('case_involved', ''),
        r.get('date_session', ''),
        r.get('date_session_source', ''),
        r.get('judges_rel', ''),
        r.get('url', ''),
        'zo'
    ])
print(out.getvalue(), end='')
" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
      "COPY _cs_staging (id, title, court_code, court_id, justice_kind, cause_num, court_room, case_description, judges, case_involved, date_session, date_session_source, judges_rel, url, source) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t')" \
      2>/dev/null

    day_inserted=$((day_inserted + count))
    page=$((page + 1))

    # Rate limit
    sleep 0.$(printf '%03d' $DELAY_MS)
  done

  # Merge staging → main with dedup
  if [ "$day_inserted" -gt 0 ]; then
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
      "INSERT INTO court_sessions SELECT * FROM _cs_staging ON CONFLICT (id) DO NOTHING;" 2>/dev/null
  fi

  total_inserted=$((total_inserted + day_inserted))
  total_days=$((total_days + 1))

  # Save state
  echo "$current" > "$STATE_FILE"

  # Progress every 10 days
  if [ $((total_days % 10)) -eq 0 ]; then
    elapsed=$(( $(date +%s) - start_ts ))
    rate=$( [ $elapsed -gt 0 ] && echo "$((total_inserted / elapsed))" || echo "0" )
    db_total=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM court_sessions;" 2>/dev/null | tr -d ' ')
    echo "[$(date +%H:%M:%S)] $current | day $total_days | +${day_inserted} today | fetched: ${total_inserted} | db: ${db_total} | ${rate}/sec"
  fi

  # Next day
  current=$(date -d "$current + 1 day" +%Y-%m-%d)
done

# Cleanup staging
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c "DROP TABLE IF EXISTS _cs_staging;" 2>/dev/null

# Final stats
elapsed=$(( $(date +%s) - start_ts ))
echo ""
echo "=== Crawl Complete ==="
echo "Days: $total_days"
echo "Records fetched: $total_inserted"
echo "Time: ${elapsed}s"
echo ""

# Remove state file on success
rm -f "$STATE_FILE"

# DB stats
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
