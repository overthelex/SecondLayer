#!/bin/bash
# Import ЄДРСР 2023 metadata into PostgreSQL (via docker exec)
# Usage: ./import-edrsr-2023.sh [CONTAINER] [THREADS]
#
# Example:
#   ./import-edrsr-2023.sh secondlayer-postgres-local 100

set -euo pipefail

CONTAINER="${1:-secondlayer-postgres-local}"
THREADS="${2:-100}"
PGUSER="secondlayer"
PGDATABASE="secondlayer_local"

# psql via docker exec
run_psql() {
  docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

WORK_DIR="/tmp/edrsr_import_2023_$$"
DATA_URL="https://data.gov.ua/dataset/e0f2c66a-f773-442e-afcd-569be6a36c82/resource/eda19e26-6a9f-4ee7-bf9f-e8577a2f0814/download/edrsr_data_2023.zip"
ZIP_FILE="/tmp/edrsr_data_2023.zip"

echo "=== ЄДРСР 2023 Import ==="
echo "Container: $CONTAINER, DB: $PGDATABASE, Threads: $THREADS"
echo ""

# --- Step 1: Download if not exists ---
if [ -f "$ZIP_FILE" ]; then
  echo "[1/6] ZIP already exists: $ZIP_FILE ($(du -h $ZIP_FILE | cut -f1))"
else
  echo "[1/6] Downloading edrsr_data_2023.zip..."
  wget -q -O "$ZIP_FILE" "$DATA_URL"
fi

# --- Step 2: Extract ---
echo "[2/6] Extracting..."
mkdir -p "$WORK_DIR"
unzip -o "$ZIP_FILE" -d "$WORK_DIR"
echo "  Files extracted to $WORK_DIR"
ls -lh "$WORK_DIR"

# --- Step 3: Run migration ---
echo "[3/6] Running migration..."
run_psql < "$(dirname "$0")/../../mcp_backend/src/migrations/071_edrsr_metadata.sql"
echo "  Tables created"

# --- Step 4: Import reference tables ---
echo "[4/6] Importing reference tables..."

clean_csv() {
  sed 's/"//g' "$1"
}

# Truncate all tables (idempotent re-import)
run_psql -c "TRUNCATE edrsr_documents, edrsr_cause_categories, edrsr_courts, edrsr_judgment_forms, edrsr_justice_kinds, edrsr_regions, edrsr_instances CASCADE;"

clean_csv "$WORK_DIR/instances.csv" | run_psql -c "COPY edrsr_instances(instance_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  instances: done"

clean_csv "$WORK_DIR/regions.csv" | run_psql -c "COPY edrsr_regions(region_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  regions: done"

clean_csv "$WORK_DIR/courts.csv" | run_psql -c "COPY edrsr_courts(court_code, name, instance_code, region_code) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  courts: done"

clean_csv "$WORK_DIR/justice_kinds.csv" | run_psql -c "COPY edrsr_justice_kinds(justice_kind, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  justice_kinds: done"

clean_csv "$WORK_DIR/judgment_forms.csv" | run_psql -c "COPY edrsr_judgment_forms(judgment_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  judgment_forms: done"

run_psql -c "COPY edrsr_cause_categories(category_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true, QUOTE '\"');" < "$WORK_DIR/cause_categories.csv"
echo "  cause_categories: done"

# --- Step 5: Split and parallel import documents ---
echo "[5/6] Importing documents.csv ($THREADS threads)..."

DOC_FILE="$WORK_DIR/documents.csv"
TOTAL_LINES=$(wc -l < "$DOC_FILE")
BODY_LINES=$((TOTAL_LINES - 1))
CHUNK_SIZE=$(( (BODY_LINES + THREADS - 1) / THREADS ))

echo "  Total records: $BODY_LINES, chunk size: ~$CHUNK_SIZE"

tail -n +2 "$DOC_FILE" > "$WORK_DIR/docs_noheader.csv"
split -l "$CHUNK_SIZE" -d -a 3 "$WORK_DIR/docs_noheader.csv" "$WORK_DIR/chunk_"

# Disable indexes for faster import
echo "  Disabling indexes..."
run_psql -c "
  DROP INDEX IF EXISTS idx_edrsr_docs_court;
  DROP INDEX IF EXISTS idx_edrsr_docs_justice;
  DROP INDEX IF EXISTS idx_edrsr_docs_judgment;
  DROP INDEX IF EXISTS idx_edrsr_docs_category;
  DROP INDEX IF EXISTS idx_edrsr_docs_cause_num;
  DROP INDEX IF EXISTS idx_edrsr_docs_judge;
  DROP INDEX IF EXISTS idx_edrsr_docs_adjudication;
  DROP INDEX IF EXISTS idx_edrsr_docs_receipt;
  DROP INDEX IF EXISTS idx_edrsr_docs_status;
"

import_chunk() {
  local chunk_file="$1"
  local container="$2"
  local pguser="$3"
  local pgdb="$4"
  local chunk_name=$(basename "$chunk_file")
  local lines=$(wc -l < "$chunk_file")
  local TAB=$'\t'
  echo "  [$chunk_name] Starting: $lines rows..."
  docker exec -i "$container" psql -U "$pguser" -d "$pgdb" -v ON_ERROR_STOP=1 \
    -c "COPY edrsr_documents(doc_id, court_code, judgment_code, justice_kind, category_code, cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '\"', NULL '');" < "$chunk_file"
  echo "  [$chunk_name] Done: $lines rows imported"
}

export -f import_chunk

# Run parallel imports
PIDS=()
for chunk in "$WORK_DIR"/chunk_*; do
  import_chunk "$chunk" "$CONTAINER" "$PGUSER" "$PGDATABASE" &
  PIDS+=($!)
  # Limit concurrency
  if [ ${#PIDS[@]} -ge "$THREADS" ]; then
    wait "${PIDS[0]}"
    PIDS=("${PIDS[@]:1}")
  fi
done
wait

echo "  All chunks imported"

# --- Step 6: Rebuild indexes and constraints ---
echo "[6/6] Rebuilding indexes and constraints..."
run_psql -c "
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_court ON edrsr_documents(court_code);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_justice ON edrsr_documents(justice_kind);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_judgment ON edrsr_documents(judgment_code);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_category ON edrsr_documents(category_code);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_cause_num ON edrsr_documents(cause_num);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_judge ON edrsr_documents(judge);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_adjudication ON edrsr_documents(adjudication_date);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_receipt ON edrsr_documents(receipt_date);
  CREATE INDEX IF NOT EXISTS idx_edrsr_docs_status ON edrsr_documents(status);
"
echo "  Indexes rebuilt"

# Verify
echo ""
echo "=== Verification ==="
run_psql -c "SELECT 'edrsr_documents' AS table_name, COUNT(*) FROM edrsr_documents
           UNION ALL SELECT 'edrsr_courts', COUNT(*) FROM edrsr_courts
           UNION ALL SELECT 'edrsr_regions', COUNT(*) FROM edrsr_regions
           UNION ALL SELECT 'edrsr_cause_categories', COUNT(*) FROM edrsr_cause_categories;"

run_psql -c "SELECT jk.name AS justice_kind, COUNT(*) AS cnt
           FROM edrsr_documents d JOIN edrsr_justice_kinds jk ON d.justice_kind = jk.justice_kind
           GROUP BY jk.name ORDER BY cnt DESC;"

echo ""
echo "=== Table size ==="
run_psql -c "SELECT pg_size_pretty(pg_total_relation_size('edrsr_documents')) AS documents_total_size;"

# Cleanup
rm -rf "$WORK_DIR"
echo ""
echo "=== Done! ==="
