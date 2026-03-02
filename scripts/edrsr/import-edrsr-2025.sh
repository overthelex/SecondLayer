#!/bin/bash
# Import ЄДРСР 2025 metadata into PostgreSQL
# Usage: ./import-edrsr-2025.sh <PGHOST> <PGPORT> <PGUSER> <PGPASSWORD> <PGDATABASE> [THREADS]
#
# Example (prod):
#   ./import-edrsr-2025.sh localhost 5438 secondlayer_user PASSWORD secondlayer_prod 10

set -euo pipefail

PGHOST="${1:?Usage: $0 <host> <port> <user> <password> <database> [threads]}"
PGPORT="${2:?}"
PGUSER="${3:?}"
PGPASSWORD="${4:?}"
PGDATABASE="${5:?}"
THREADS="${6:-10}"

export PGPASSWORD

PSQL="psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -v ON_ERROR_STOP=1"
WORK_DIR="/tmp/edrsr_import_$$"
DATA_URL="https://data.gov.ua/dataset/2a95ae17-ed46-42ae-ad66-dd9b7a727bb7/resource/9f19ad2b-000f-4176-b283-95e399ad8e5e/download/edrsr_data_2025.zip"
ZIP_FILE="/tmp/edrsr_data_2025.zip"

echo "=== ЄДРСР 2025 Import ==="
echo "Host: $PGHOST:$PGPORT, DB: $PGDATABASE, Threads: $THREADS"
echo ""

# --- Step 1: Download if not exists ---
if [ -f "$ZIP_FILE" ]; then
  echo "[1/6] ZIP already exists: $ZIP_FILE ($(du -h $ZIP_FILE | cut -f1))"
else
  echo "[1/6] Downloading edrsr_data_2025.zip..."
  wget -q --show-progress -O "$ZIP_FILE" "$DATA_URL"
fi

# --- Step 2: Extract ---
echo "[2/6] Extracting..."
mkdir -p "$WORK_DIR"
unzip -o "$ZIP_FILE" -d "$WORK_DIR"
echo "  Files extracted to $WORK_DIR"
ls -lh "$WORK_DIR"

# --- Step 3: Run migration ---
echo "[3/6] Running migration..."
$PSQL -f "$(dirname "$0")/../../mcp_backend/src/migrations/070_edrsr_metadata.sql"
echo "  Tables created"

# --- Step 4: Import reference tables ---
echo "[4/6] Importing reference tables..."

# Clean quotes from CSV values for COPY
clean_csv() {
  sed 's/"//g' "$1"
}

# Truncate all tables (idempotent re-import)
$PSQL -c "TRUNCATE edrsr_documents, edrsr_cause_categories, edrsr_courts, edrsr_judgment_forms, edrsr_justice_kinds, edrsr_regions, edrsr_instances CASCADE;"

clean_csv "$WORK_DIR/instances.csv" | $PSQL -c "COPY edrsr_instances(instance_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  instances: done"

clean_csv "$WORK_DIR/regions.csv" | $PSQL -c "COPY edrsr_regions(region_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  regions: done"

clean_csv "$WORK_DIR/courts.csv" | $PSQL -c "COPY edrsr_courts(court_code, name, instance_code, region_code) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  courts: done"

clean_csv "$WORK_DIR/justice_kinds.csv" | $PSQL -c "COPY edrsr_justice_kinds(justice_kind, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  justice_kinds: done"

clean_csv "$WORK_DIR/judgment_forms.csv" | $PSQL -c "COPY edrsr_judgment_forms(judgment_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  judgment_forms: done"

clean_csv "$WORK_DIR/cause_categories.csv" | $PSQL -c "COPY edrsr_cause_categories(category_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
echo "  cause_categories: done"

# --- Step 5: Split and parallel import documents ---
echo "[5/6] Importing documents.csv ($THREADS threads)..."

DOC_FILE="$WORK_DIR/documents.csv"
TOTAL_LINES=$(wc -l < "$DOC_FILE")
BODY_LINES=$((TOTAL_LINES - 1))
CHUNK_SIZE=$(( (BODY_LINES + THREADS - 1) / THREADS ))

echo "  Total records: $BODY_LINES, chunk size: ~$CHUNK_SIZE"

# Remove header only (CSV format COPY handles quotes natively)
tail -n +2 "$DOC_FILE" > "$WORK_DIR/docs_noheader.csv"
split -l "$CHUNK_SIZE" -d -a 2 "$WORK_DIR/docs_noheader.csv" "$WORK_DIR/chunk_"

# Disable indexes for faster import
echo "  Disabling indexes..."
$PSQL -c "
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

# No FK constraints — source data contains codes not in reference tables

import_chunk() {
  local chunk_file="$1"
  local chunk_name=$(basename "$chunk_file")
  local lines=$(wc -l < "$chunk_file")
  local TAB=$(printf '\t')
  echo "  [$chunk_name] Starting: $lines rows..."
  $PSQL -c "COPY edrsr_documents(doc_id, court_code, judgment_code, justice_kind, category_code, cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ) FROM STDIN WITH (FORMAT csv, DELIMITER '$TAB', QUOTE '\"', NULL '');" < "$chunk_file"
  echo "  [$chunk_name] Done: $lines rows imported"
}

export -f import_chunk
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PSQL

# Run parallel imports
PIDS=()
for chunk in "$WORK_DIR"/chunk_*; do
  import_chunk "$chunk" &
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
$PSQL -c "
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

echo "  No FK constraints (source data has codes not in reference tables)"

# Verify
echo ""
echo "=== Verification ==="
$PSQL -c "SELECT 'edrsr_documents' AS table_name, COUNT(*) FROM edrsr_documents
           UNION ALL SELECT 'edrsr_courts', COUNT(*) FROM edrsr_courts
           UNION ALL SELECT 'edrsr_regions', COUNT(*) FROM edrsr_regions
           UNION ALL SELECT 'edrsr_cause_categories', COUNT(*) FROM edrsr_cause_categories;"

$PSQL -c "SELECT jk.name AS justice_kind, COUNT(*) AS cnt
           FROM edrsr_documents d JOIN edrsr_justice_kinds jk ON d.justice_kind = jk.justice_kind
           GROUP BY jk.name ORDER BY cnt DESC;"

echo ""
echo "=== Table size ==="
$PSQL -c "SELECT pg_size_pretty(pg_total_relation_size('edrsr_documents')) AS documents_total_size;"

# Cleanup
rm -rf "$WORK_DIR"
echo ""
echo "=== Done! ==="
