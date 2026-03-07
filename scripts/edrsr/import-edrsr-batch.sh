#!/bin/bash
# Batch import ЄДРСР 2015-2022 metadata into PostgreSQL (via docker exec)
# Appends to existing data (does NOT truncate edrsr_documents)
# Usage: ./import-edrsr-batch.sh [CONTAINER] [THREADS]

set -euo pipefail

CONTAINER="${1:-secondlayer-postgres-local}"
THREADS="${2:-100}"
PGUSER="secondlayer"
PGDATABASE="secondlayer_local"

run_psql() {
  docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

declare -A URLS
URLS[2022]="https://data.gov.ua/dataset/42c195b3-b915-4000-934a-7741825d1812/resource/57e98c05-4426-41a0-86e7-e04cfe8f6a8c/download/edrsr_data_2022.zip"
URLS[2021]="https://data.gov.ua/dataset/bcffb3ae-8e4f-4443-8058-d525257ab69e/resource/d26fc705-6744-4c15-87cc-2ce472091101/download/edrsr_data_2021.zip"
URLS[2020]="https://data.gov.ua/dataset/83f1292d-43c9-43b8-8f89-aa2f3d14fd3a/resource/d89cd4cf-4705-4700-ba00-69a249ed9894/download/edrsr_data_2020.zip"
URLS[2019]="https://data.gov.ua/dataset/1c13f2f1-8bc4-41d4-81dc-ea4527fa73de/resource/c0985958-1fa9-435e-973b-a4863a8be027/download/edrsr_data_2019.zip"
URLS[2018]="https://data.gov.ua/dataset/d2c2af31-cc4e-4a85-9f35-be4dba2354c2/resource/ed9575f6-8041-4581-8622-2fba792ee8ce/download/edrsr_data_2018.zip"
URLS[2017]="https://data.gov.ua/dataset/a7a72086-8b58-478d-b84b-eaa27d06ae9f/resource/f227a599-08f3-471e-a621-afa3d292b7ed/download/edrsr_data_2017.zip"
URLS[2016]="https://data.gov.ua/dataset/66169489-8877-48ae-a061-9eb91852876b/resource/b02dadfa-bea1-4a5e-b851-2a0888b87ef6/download/edrsr_data_2016.zip"
URLS[2015]="https://data.gov.ua/dataset/3951f2eb-a35b-4b35-a305-7afe471a9bca/resource/777859bd-f52c-478b-8d45-956facc40252/download/edrsr_data_2015.zip"

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

# Drop indexes once before batch
echo "=== Dropping indexes for bulk import ==="
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

TOTAL_IMPORTED=0

for YEAR in 2022 2021 2020 2019 2018 2017 2016 2015; do
  echo ""
  echo "========================================"
  echo "=== ЄДРСР $YEAR ==="
  echo "========================================"

  ZIP_FILE="/tmp/edrsr_data_${YEAR}.zip"
  WORK_DIR="/tmp/edrsr_import_${YEAR}_$$"
  URL="${URLS[$YEAR]}"

  # Download
  if [ -f "$ZIP_FILE" ]; then
    echo "[DL] Already exists: $ZIP_FILE ($(du -h "$ZIP_FILE" | cut -f1))"
  else
    echo "[DL] Downloading edrsr_data_${YEAR}.zip..."
    wget -q -O "$ZIP_FILE" "$URL"
    echo "[DL] Done: $(du -h "$ZIP_FILE" | cut -f1)"
  fi

  # Extract
  echo "[EX] Extracting..."
  mkdir -p "$WORK_DIR"
  unzip -o "$ZIP_FILE" -d "$WORK_DIR" > /dev/null

  # Reference tables — only update from most recent year (2022)
  if [ "$YEAR" = "2022" ]; then
    echo "[REF] Importing reference tables from $YEAR..."
    run_psql -c "TRUNCATE edrsr_cause_categories, edrsr_courts, edrsr_judgment_forms, edrsr_justice_kinds, edrsr_regions, edrsr_instances CASCADE;"

    sed 's/"//g' "$WORK_DIR/instances.csv" | run_psql -c "COPY edrsr_instances(instance_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
    sed 's/"//g' "$WORK_DIR/regions.csv" | run_psql -c "COPY edrsr_regions(region_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
    sed 's/"//g' "$WORK_DIR/courts.csv" | run_psql -c "COPY edrsr_courts(court_code, name, instance_code, region_code) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
    sed 's/"//g' "$WORK_DIR/justice_kinds.csv" | run_psql -c "COPY edrsr_justice_kinds(justice_kind, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
    sed 's/"//g' "$WORK_DIR/judgment_forms.csv" | run_psql -c "COPY edrsr_judgment_forms(judgment_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true);"
    run_psql -c "COPY edrsr_cause_categories(category_code, name) FROM STDIN WITH (FORMAT csv, DELIMITER E'\t', HEADER true, QUOTE '\"');" < "$WORK_DIR/cause_categories.csv"
    echo "[REF] Done"
  fi

  # Documents — split and parallel import
  DOC_FILE="$WORK_DIR/documents.csv"
  TOTAL_LINES=$(wc -l < "$DOC_FILE")
  BODY_LINES=$((TOTAL_LINES - 1))
  CHUNK_SIZE=$(( (BODY_LINES + THREADS - 1) / THREADS ))

  echo "[IMP] $BODY_LINES documents, $THREADS threads, chunk ~$CHUNK_SIZE"

  tail -n +2 "$DOC_FILE" > "$WORK_DIR/docs_noheader.csv"
  split -l "$CHUNK_SIZE" -d -a 3 "$WORK_DIR/docs_noheader.csv" "$WORK_DIR/chunk_"

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

  TOTAL_IMPORTED=$((TOTAL_IMPORTED + BODY_LINES))
  echo "[OK] $YEAR done: $BODY_LINES docs (running total: $TOTAL_IMPORTED)"

  # Cleanup work dir
  rm -rf "$WORK_DIR"
done

# Rebuild indexes
echo ""
echo "=== Rebuilding indexes ==="
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

# Final verification
echo ""
echo "=== Final Verification ==="
run_psql -c "SELECT COUNT(*) AS total_documents FROM edrsr_documents;"
run_psql -c "SELECT EXTRACT(YEAR FROM adjudication_date) AS year, COUNT(*) AS cnt FROM edrsr_documents WHERE adjudication_date IS NOT NULL GROUP BY year ORDER BY year;"
run_psql -c "SELECT pg_size_pretty(pg_total_relation_size('edrsr_documents')) AS total_size;"

echo ""
echo "=== All years imported! Total: $TOTAL_IMPORTED ==="
