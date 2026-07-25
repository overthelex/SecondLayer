#!/bin/bash
# Import ЄДРСР 2014 metadata into PostgreSQL (via docker exec)
# Downloads from data.gov.ua, imports reference tables + documents
# Usage: ./import-edrsr-2014.sh [CONTAINER] [THREADS]

set -euo pipefail

CONTAINER="${1:-secondlayer-postgres-stage}"
THREADS="${2:-10}"
PGUSER="secondlayer"
PGDATABASE="secondlayer_stage"

run_psql() {
  docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

DATA_URL="https://data.gov.ua/dataset/e5c3c05a-61f5-4422-a41b-82dff1f71856/resource/93b30460-f857-4879-baf9-48bed096bea8/download/edrsr_data_2014.zip"
ZIP_FILE="/tmp/edrsr_data_2014.zip"
WORK_DIR="/tmp/edrsr_import_2014_$$"

echo "=== ЄДРСР 2014 Import ==="
echo "Container: $CONTAINER, DB: $PGDATABASE, Threads: $THREADS"
echo ""

# --- Step 1: Download ---
if [ -f "$ZIP_FILE" ]; then
  echo "[1/6] ZIP already exists: $ZIP_FILE ($(du -h $ZIP_FILE | cut -f1))"
else
  echo "[1/6] Downloading edrsr_data_2014.zip..."
  wget -q -O "$ZIP_FILE" "$DATA_URL"
  echo "[1/6] Done: $(du -h $ZIP_FILE | cut -f1)"
fi

# --- Step 2: Extract ---
echo "[2/6] Extracting..."
mkdir -p "$WORK_DIR"
unzip -o "$ZIP_FILE" -d "$WORK_DIR"
ls -lh "$WORK_DIR"

# --- Step 3: Import reference tables ---
echo "[3/6] Importing reference tables..."

# Check if reference tables are empty — if so, populate them
REF_COUNT=$(run_psql -Atc "SELECT COUNT(*) FROM edrsr_courts;")
if [ "$REF_COUNT" = "0" ]; then
  echo "  Reference tables empty, importing..."
  sed 's/"//g' "$WORK_DIR/instances.csv" | run_psql -c "COPY edrsr_instances(instance_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
  echo "  instances: done"

  sed 's/"//g' "$WORK_DIR/regions.csv" | run_psql -c "COPY edrsr_regions(region_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
  echo "  regions: done"

  sed 's/"//g' "$WORK_DIR/courts.csv" | run_psql -c "COPY edrsr_courts(court_code, name, instance_code, region_code) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
  echo "  courts: done"

  sed 's/"//g' "$WORK_DIR/justice_kinds.csv" | run_psql -c "COPY edrsr_justice_kinds(justice_kind, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
  echo "  justice_kinds: done"

  sed 's/"//g' "$WORK_DIR/judgment_forms.csv" | run_psql -c "COPY edrsr_judgment_forms(judgment_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
  echo "  judgment_forms: done"

  run_psql -c "COPY edrsr_cause_categories(category_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true, QUOTE '\"');" < "$WORK_DIR/cause_categories.csv"
  echo "  cause_categories: done"
else
  echo "  Reference tables already populated ($REF_COUNT courts), skipping"
fi

# --- Step 4: Drop indexes for bulk import ---
echo "[4/6] Dropping indexes..."
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

# --- Step 5: Split and parallel import documents ---
echo "[5/6] Importing documents..."

DOC_FILE="$WORK_DIR/documents.csv"
TOTAL_LINES=$(wc -l < "$DOC_FILE")
BODY_LINES=$((TOTAL_LINES - 1))
CHUNK_SIZE=$(( (BODY_LINES + THREADS - 1) / THREADS ))

echo "  Total records: $BODY_LINES, chunk size: ~$CHUNK_SIZE, threads: $THREADS"

tail -n +2 "$DOC_FILE" > "$WORK_DIR/docs_noheader.csv"
split -l "$CHUNK_SIZE" -d -a 3 "$WORK_DIR/docs_noheader.csv" "$WORK_DIR/chunk_"

import_chunk() {
  local chunk_file="$1"
  local container="$2"
  local pguser="$3"
  local pgdb="$4"
  local chunk_name=$(basename "$chunk_file")
  local lines=$(wc -l < "$chunk_file")
  echo "  [$chunk_name] $lines rows..."
  docker exec -i "$container" psql -U "$pguser" -d "$pgdb" -v ON_ERROR_STOP=1 \
    -c "COPY edrsr_documents(doc_id, court_code, judgment_code, justice_kind, category_code, cause_num, adjudication_date, receipt_date, judge, doc_url, status, date_publ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '\"', NULL '');" < "$chunk_file"
  echo "  [$chunk_name] Done"
}
export -f import_chunk

PIDS=()
for chunk in "$WORK_DIR"/chunk_*; do
  import_chunk "$chunk" "$CONTAINER" "$PGUSER" "$PGDATABASE" &
  PIDS+=($!)
  if [ ${#PIDS[@]} -ge "$THREADS" ]; then
    wait "${PIDS[0]}"
    PIDS=("${PIDS[@]:1}")
  fi
done
wait

echo "  All chunks imported"

# --- Step 6: Rebuild indexes ---
echo "[6/6] Rebuilding indexes..."
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

# Verification
echo ""
echo "=== Verification ==="
run_psql -c "SELECT COUNT(*) AS total_documents FROM edrsr_documents;"
run_psql -c "SELECT EXTRACT(YEAR FROM adjudication_date) AS year, COUNT(*) AS cnt FROM edrsr_documents WHERE adjudication_date IS NOT NULL GROUP BY year ORDER BY year;"
run_psql -c "SELECT pg_size_pretty(pg_total_relation_size('edrsr_documents')) AS total_size;"

# Cleanup
rm -rf "$WORK_DIR"
echo ""
echo "=== Done! ЄДРСР 2014: $BODY_LINES documents imported ==="
