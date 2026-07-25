#!/usr/bin/env bash
# Download ALL OpenSanctions datasets (via 'default' collection) and import into prod PostgreSQL
# Run ON the prod server: ./import-opensanctions-prod.sh [WORKERS]
#
# Source: https://www.opensanctions.org/datasets/
# Uses 'default' collection CSV (~460MB, 4.16M entities from all 346 datasets)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
WORKERS="${1:-50}"

# DB — connects to secondlayer-postgres-stage container via mapped port
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5434}"
DB_NAME="${DB_NAME:-secondlayer_stage}"
DB_USER="${DB_USER:-secondlayer}"
DB_PASS="${DB_PASS:-SecondLayer_Stage_2026_PostgreSQL_Pass_7X5k8mN2pQ}"

export PGPASSWORD="$DB_PASS"

echo "╔══════════════════════════════════════════════════╗"
echo "║  OpenSanctions Full Import (all 346 datasets)   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Workers:  $WORKERS"
echo "  DB:       $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# 1. Create table
echo "[1/4] Creating table..."
docker exec -i secondlayer-postgres-stage \
  psql -U "$DB_USER" -d "$DB_NAME" < "$SCRIPT_DIR/create-opensanctions-table.sql"
echo "  Done."

# 2. Download
mkdir -p "$DATA_DIR"
CSV_FILE="$DATA_DIR/default.csv"

if [ ! -f "$CSV_FILE" ] || [ "$(find "$CSV_FILE" -mtime +1 2>/dev/null)" ]; then
  echo "[2/4] Downloading default collection CSV (~460MB)..."
  curl -# -o "$CSV_FILE.tmp" \
    "https://data.opensanctions.org/datasets/latest/default/targets.simple.csv"
  mv "$CSV_FILE.tmp" "$CSV_FILE"
  LINES=$(wc -l < "$CSV_FILE")
  SIZE=$(du -h "$CSV_FILE" | cut -f1)
  echo "  Downloaded: $((LINES - 1)) records, $SIZE"
else
  LINES=$(wc -l < "$CSV_FILE")
  SIZE=$(du -h "$CSV_FILE" | cut -f1)
  echo "[2/4] Using cached data ($SIZE, $((LINES - 1)) records)"
fi

# 3. Import
echo "[3/4] Importing with $WORKERS workers..."

# Resolve node path (try nvm, system, docker)
NODE_BIN=""
if command -v node &>/dev/null; then
  NODE_BIN="node"
elif [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  NODE_BIN="node"
fi

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found. Install Node.js 20+ first."
  exit 1
fi

# pg module — use from mcp_backend if available
NODE_PATH_OPT=""
if [ -d "$SCRIPT_DIR/../../mcp_backend/node_modules/pg" ]; then
  NODE_PATH_OPT="$SCRIPT_DIR/../../mcp_backend/node_modules"
elif [ -d "$SCRIPT_DIR/node_modules/pg" ]; then
  NODE_PATH_OPT="$SCRIPT_DIR/node_modules"
else
  echo "  Installing pg module locally..."
  (cd "$SCRIPT_DIR" && npm init -y --silent && npm install --silent pg)
  NODE_PATH_OPT="$SCRIPT_DIR/node_modules"
fi

NODE_PATH="$NODE_PATH_OPT" $NODE_BIN "$SCRIPT_DIR/import-opensanctions.mjs" \
  --file "$CSV_FILE" \
  --workers "$WORKERS" \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --database "$DB_NAME" \
  --user "$DB_USER" \
  --password "$DB_PASS" \
  --truncate

# 4. Stats
echo "[4/4] Import statistics:"
docker exec secondlayer-postgres-stage psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
  schema AS type,
  COUNT(*) AS total,
  MIN(first_seen::date) AS earliest,
  MAX(last_seen::date) AS latest
FROM opensanctions_entities
GROUP BY schema
ORDER BY total DESC
LIMIT 15;
"

docker exec secondlayer-postgres-stage psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
  COUNT(*) AS total_entities,
  pg_size_pretty(pg_total_relation_size('opensanctions_entities')) AS table_size,
  COUNT(DISTINCT split_part(datasets, ';', 1)) AS distinct_datasets
FROM opensanctions_entities;
"

echo ""
echo "Done! Table: opensanctions_entities"
echo ""
echo "Sample queries:"
echo "  -- Search by name"
echo "  SELECT id, name, schema, sanctions FROM opensanctions_entities WHERE name ILIKE '%putin%' LIMIT 5;"
echo ""
echo "  -- Filter by dataset"
echo "  SELECT COUNT(*) FROM opensanctions_entities WHERE datasets LIKE '%ua_nsdc_sanctions%';"
echo ""
echo "  -- Stats by country"
echo "  SELECT countries, COUNT(*) FROM opensanctions_entities WHERE countries != '' GROUP BY countries ORDER BY count DESC LIMIT 10;"
