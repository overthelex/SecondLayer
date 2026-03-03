#!/usr/bin/env bash
# Import court sessions CSV from data.gov.ua into HUDOC PostgreSQL on HDD
# Usage: ./scripts/hudoc/import-court-sessions.sh [path-to-csv]
#
# Prerequisites:
#   docker compose -f deployment/docker-compose.local.yml --env-file deployment/.env.local up -d postgres-hudoc-local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CSV_FILE="${1:-$SCRIPT_DIR/court-sessions-sample.csv}"
CONTAINER="postgres-hudoc-local"
DB_USER="${HUDOC_POSTGRES_USER:-hudoc}"
DB_NAME="${HUDOC_POSTGRES_DB:-hudoc_local}"

if [ ! -f "$CSV_FILE" ]; then
  echo "ERROR: CSV file not found: $CSV_FILE"
  echo "Download it first:"
  echo "  curl -Lo scripts/hudoc/court-sessions-sample.csv \\"
  echo "    'https://data.gov.ua/dataset/3a321301-a06f-487b-9d19-e6b917250aee/resource/98d6ba0d-1c18-4835-ae68-bfc0af724bfa/download/spisok-sprav-priznachenih-do-rozglyadu.csv'"
  exit 1
fi

echo "=== HUDOC Court Sessions Import ==="
echo "CSV file: $CSV_FILE ($(du -h "$CSV_FILE" | cut -f1))"
echo "Container: $CONTAINER"
echo ""

# Wait for container to be healthy
echo "Waiting for $CONTAINER to be healthy..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" &>/dev/null; then
    echo "Database is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: $CONTAINER is not ready after 30 seconds."
    echo "Start it with: docker compose -f deployment/docker-compose.local.yml --env-file deployment/.env.local up -d postgres-hudoc-local"
    exit 1
  fi
  sleep 1
done

# Step 1: Create main table and extensions
echo "Creating table and extensions..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS court_sessions (
    id              BIGSERIAL PRIMARY KEY,
    date_session    TIMESTAMP,
    date_raw        TEXT,
    judges          TEXT,
    cause_num       TEXT,
    court_name      TEXT,
    court_room      TEXT,
    case_involved   TEXT,
    case_description TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Permanent staging table (not temp — survives between psql sessions)
DROP TABLE IF EXISTS _import_staging;
CREATE TABLE _import_staging (
    date_raw        TEXT,
    judges          TEXT,
    cause_num       TEXT,
    court_name      TEXT,
    court_room      TEXT,
    case_involved   TEXT,
    case_description TEXT
);
SQL

# Step 2: COPY CSV into staging
echo "Copying CSV into staging table (~483K rows, ~312MB)..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
  "\COPY _import_staging (date_raw, judges, cause_num, court_name, court_room, case_involved, case_description) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true, QUOTE '\"', ENCODING 'UTF8')" \
  < "$CSV_FILE"

# Step 3: Parse dates and move to final table
echo "Parsing dates and inserting into court_sessions..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
TRUNCATE court_sessions RESTART IDENTITY;

INSERT INTO court_sessions (date_session, date_raw, judges, cause_num, court_name, court_room, case_involved, case_description)
SELECT
    CASE
        WHEN date_raw ~ '^\d{2}\.\d{2}\.\d{4}' THEN
            TO_TIMESTAMP(date_raw, 'DD.MM.YYYY HH24:MI')
        ELSE NULL
    END,
    date_raw,
    judges,
    cause_num,
    court_name,
    NULLIF(TRIM(court_room), ''),
    case_involved,
    case_description
FROM _import_staging;

DROP TABLE _import_staging;
SQL

# Step 4: Create indexes
echo "Creating indexes..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
CREATE INDEX IF NOT EXISTS idx_court_sessions_date ON court_sessions (date_session);
CREATE INDEX IF NOT EXISTS idx_court_sessions_cause_num ON court_sessions (cause_num);
CREATE INDEX IF NOT EXISTS idx_court_sessions_court_name ON court_sessions USING gin (court_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_court_sessions_description ON court_sessions USING gin (case_description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_court_sessions_involved ON court_sessions USING gin (case_involved gin_trgm_ops);

ANALYZE court_sessions;
SQL

# Step 5: Print stats
echo ""
echo "=== Import Complete ==="
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
SELECT
    COUNT(*) AS total_rows,
    COUNT(date_session) AS parsed_dates,
    MIN(date_session) AS earliest_session,
    MAX(date_session) AS latest_session,
    COUNT(DISTINCT court_name) AS unique_courts,
    pg_size_pretty(pg_total_relation_size('court_sessions')) AS table_size
FROM court_sessions;
SQL
