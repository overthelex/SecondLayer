#!/usr/bin/env bash
# Download NSDC sanctions data from OpenSanctions mirror and import into PostgreSQL
# Usage: ./import-sanctions.sh [WORKERS=50]
#
# Data source: https://data.opensanctions.org/datasets/latest/ua_nsdc_sanctions/
# Original registry: https://drs.nsdc.gov.ua/export/subjects

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
WORKERS="${1:-50}"

# DB connection (local)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-secondlayer_local}"
DB_USER="${DB_USER:-secondlayer}"
DB_PASS="${DB_PASS:-local_dev_password}"

export PGPASSWORD="$DB_PASS"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -q"

echo "=== NSDC Sanctions Import ==="
echo "Workers: $WORKERS"
echo "DB: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# 1. Create table
echo "[1/4] Creating table..."
$PSQL -f "$SCRIPT_DIR/create-table.sql"

# 2. Download data
mkdir -p "$DATA_DIR"
NESTED_JSON="$DATA_DIR/targets.nested.json"
TODAY=$(date +%Y%m%d)

if [ ! -f "$NESTED_JSON" ] || [ "$(find "$NESTED_JSON" -mtime +1 2>/dev/null)" ]; then
  echo "[2/4] Downloading nested JSON (~120MB)..."
  curl -# -o "$NESTED_JSON.tmp" \
    "https://data.opensanctions.org/datasets/latest/ua_nsdc_sanctions/targets.nested.json"
  mv "$NESTED_JSON.tmp" "$NESTED_JSON"
  echo "  Downloaded: $(wc -l < "$NESTED_JSON") records, $(du -h "$NESTED_JSON" | cut -f1)"
else
  echo "[2/4] Using cached data ($(du -h "$NESTED_JSON" | cut -f1), $(wc -l < "$NESTED_JSON") records)"
fi

# 3. Filter last 5 years and import
echo "[3/4] Importing with $WORKERS workers..."
CUTOFF_DATE=$(date -d "5 years ago" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -v-5y +%Y-%m-%dT%H:%M:%S)

node "$SCRIPT_DIR/import-worker.mjs" \
  --file "$NESTED_JSON" \
  --workers "$WORKERS" \
  --cutoff "$CUTOFF_DATE" \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --database "$DB_NAME" \
  --user "$DB_USER" \
  --password "$DB_PASS"

# 4. Stats
echo "[4/4] Import stats:"
$PSQL -c "
SELECT
  schema AS type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE sanctions_status = 'active') AS active,
  MIN(first_seen::date) AS earliest,
  MAX(last_seen::date) AS latest
FROM nsdc_sanctions_subjects
GROUP BY schema
ORDER BY total DESC;
"

TOTAL=$($PSQL -t -c "SELECT COUNT(*) FROM nsdc_sanctions_subjects")
echo "Total records: $TOTAL"
echo "=== Done ==="
