#!/usr/bin/env bash
# Download and import ARMA EDRAA (Єдиний державний реєстр арештованих активів)
# into local PostgreSQL.
#
# Source: https://data.gov.ua/dataset/arma-edraa
# Format: JSON (Windows-1251, with decimal commas in numeric fields)
# Records: ~737K total, ~470K for 2022-2026
#
# Usage:
#   ./scripts/arma/import-arma-edraa.sh [--skip-download]
#
# Prerequisites:
#   - aria2c (apt install aria2)
#   - python3 with psycopg2-binary (pip install psycopg2-binary)
#   - PostgreSQL container running on localhost:5432

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="/tmp/arma"
DATA_URL="https://data.gov.ua/dataset/d6cc6909-4098-47bc-a2e4-96182f446982/resource/02435739-9481-40ca-b40f-6379b6ed5949/download/edra_opendata.json"

# Load env for DB password
ENV_FILE="${SCRIPT_DIR}/../../deployment/.env.local"
if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | xargs)
fi
DB_PASSWORD="${POSTGRES_PASSWORD:-local_dev_password}"

mkdir -p "$WORK_DIR"

# Step 1: Download
if [ "${1:-}" != "--skip-download" ]; then
  echo "==> Downloading ARMA EDRAA (~440 MB)..."
  aria2c --max-connection-per-server=16 --split=16 --min-split-size=1M \
    --dir="$WORK_DIR" --out=edra_opendata.json --allow-overwrite=true \
    "$DATA_URL"
else
  echo "==> Skipping download (using existing file)"
fi

echo "==> File size: $(du -h "$WORK_DIR/edra_opendata.json" | cut -f1)"

# Step 2: Parse and import
echo "==> Parsing JSON and importing into PostgreSQL..."
python3 "$SCRIPT_DIR/import-arma-edraa.py" \
  --input "$WORK_DIR/edra_opendata.json" \
  --db-host localhost \
  --db-port 5432 \
  --db-name secondlayer_local \
  --db-user secondlayer \
  --db-password "$DB_PASSWORD" \
  --min-year 2022

echo "==> Done!"
