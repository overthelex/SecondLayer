#!/bin/bash
# Import ЄДРСР metadata for doc_ids that exist in edrsr_fulltext but NOT in edrsr_documents
# Targets prod: downloads 2013+2014 from data.gov.ua, filters for matching doc_ids, imports in parallel
# Usage: ./import-edrsr-fulltext-metadata-prod.sh [CONTAINER] [THREADS]

set -euo pipefail

CONTAINER="${1:-secondlayer-postgres-prod}"
THREADS="${2:-100}"
PGUSER="secondlayer"
PGDATABASE="secondlayer_prod"

run_psql() {
  docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

# --- Step 0: Get doc_id range from edrsr_fulltext that's missing from edrsr_documents ---
echo "=== Fetching fulltext doc_id range ==="
RANGE=$(run_psql -Atc "SELECT MIN(doc_id) || ',' || MAX(doc_id) FROM edrsr_fulltext WHERE NOT EXISTS (SELECT 1 FROM edrsr_documents e WHERE e.doc_id = edrsr_fulltext.doc_id) LIMIT 1;" 2>/dev/null || true)

if [ -z "$RANGE" ] || [ "$RANGE" = "," ]; then
  # Fallback: just get full range from edrsr_fulltext
  RANGE=$(run_psql -Atc "SELECT MIN(doc_id) || ',' || MAX(doc_id) FROM edrsr_fulltext;")
fi

MIN_ID=$(echo "$RANGE" | cut -d',' -f1)
MAX_ID=$(echo "$RANGE" | cut -d',' -f2)
TOTAL_FT=$(run_psql -Atc "SELECT COUNT(*) FROM edrsr_fulltext;")

echo "  Fulltext doc_id range: $MIN_ID – $MAX_ID ($TOTAL_FT records)"
echo "  Container: $CONTAINER, DB: $PGDATABASE, Threads: $THREADS"
echo ""

# Years to download (2013 covers ~36M doc_ids, 2014 covers up to ~42M+)
declare -A URLS
URLS[2013]="https://data.gov.ua/dataset/3bc24b95-1f9e-41d6-bffa-c57088474e4a/resource/19eadafb-552b-4eef-89d6-bd17bec95575/download/edrsr_data_2013.zip"
URLS[2014]="https://data.gov.ua/dataset/e5c3c05a-61f5-4422-a41b-82dff1f71856/resource/7fb5d7cf-19b8-487f-9b6a-de1a17abbc91/download/edrsr_data_2014.zip"

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

# --- Step 1: Export existing doc_ids from edrsr_documents in the target range ---
echo "=== Exporting existing doc_ids to avoid duplicates ==="
EXISTING_FILE="/tmp/edrsr_existing_docids.txt"
run_psql -Atc "SELECT doc_id FROM edrsr_documents WHERE doc_id BETWEEN $MIN_ID AND $MAX_ID ORDER BY doc_id;" > "$EXISTING_FILE"
EXISTING_COUNT=$(wc -l < "$EXISTING_FILE")
echo "  Already in edrsr_documents: $EXISTING_COUNT doc_ids in range $MIN_ID–$MAX_ID"

# --- Step 2: Export fulltext doc_ids ---
echo "=== Exporting fulltext doc_ids ==="
FT_IDS_FILE="/tmp/edrsr_fulltext_docids.txt"
run_psql -Atc "SELECT doc_id FROM edrsr_fulltext ORDER BY doc_id;" > "$FT_IDS_FILE"
FT_COUNT=$(wc -l < "$FT_IDS_FILE")
echo "  Fulltext doc_ids: $FT_COUNT"

TOTAL_IMPORTED=0

for YEAR in 2013 2014; do
  echo ""
  echo "========================================"
  echo "=== ЄДРСР $YEAR ==="
  echo "========================================"

  ZIP_FILE="/tmp/edrsr_data_${YEAR}.zip"
  WORK_DIR="/tmp/edrsr_import_ft_${YEAR}_$$"
  URL="${URLS[$YEAR]}"

  # Download
  if [ -f "$ZIP_FILE" ]; then
    echo "[DL] Already exists: $ZIP_FILE ($(du -h "$ZIP_FILE" | cut -f1))"
  else
    echo "[DL] Downloading edrsr_data_${YEAR}.zip..."
    wget -q --show-progress -O "$ZIP_FILE" "$URL"
    echo "[DL] Done: $(du -h "$ZIP_FILE" | cut -f1)"
  fi

  # Extract
  echo "[EX] Extracting..."
  mkdir -p "$WORK_DIR"
  unzip -o "$ZIP_FILE" -d "$WORK_DIR" > /dev/null
  echo "[EX] Files: $(ls "$WORK_DIR"/*.csv | wc -l) CSV files"

  # Filter documents.csv: keep only rows where doc_id is in fulltext range
  DOC_FILE="$WORK_DIR/documents.csv"
  FILTERED_FILE="$WORK_DIR/filtered_docs.csv"

  TOTAL_LINES=$(($(wc -l < "$DOC_FILE") - 1))
  echo "[FLT] Total in $YEAR dump: $TOTAL_LINES documents"
  echo "[FLT] Filtering for doc_id $MIN_ID–$MAX_ID..."

  # Use awk to filter: field 1 (doc_id) must be in range AND exist in fulltext
  # For speed, just filter by range first, then intersect with fulltext ids
  tail -n +2 "$DOC_FILE" | awk -F'\t' -v min="$MIN_ID" -v max="$MAX_ID" '$1 >= min && $1 <= max' > "$WORK_DIR/range_filtered.csv"
  RANGE_COUNT=$(wc -l < "$WORK_DIR/range_filtered.csv")
  echo "[FLT] In doc_id range: $RANGE_COUNT"

  if [ "$RANGE_COUNT" -eq 0 ]; then
    echo "[SKIP] No matching doc_ids in $YEAR dump"
    rm -rf "$WORK_DIR"
    continue
  fi

  # Now intersect with fulltext doc_ids (only import rows that have fulltext)
  # Extract doc_ids from filtered, sort, intersect with fulltext ids
  cut -f1 "$WORK_DIR/range_filtered.csv" | sort -n > "$WORK_DIR/range_docids.txt"
  comm -12 "$WORK_DIR/range_docids.txt" "$FT_IDS_FILE" > "$WORK_DIR/matching_docids.txt"
  MATCH_COUNT=$(wc -l < "$WORK_DIR/matching_docids.txt")
  echo "[FLT] Matching fulltext doc_ids: $MATCH_COUNT"

  if [ "$MATCH_COUNT" -eq 0 ]; then
    echo "[SKIP] No fulltext matches in $YEAR dump"
    rm -rf "$WORK_DIR"
    continue
  fi

  # Remove already-existing doc_ids
  if [ "$EXISTING_COUNT" -gt 0 ]; then
    comm -23 "$WORK_DIR/matching_docids.txt" "$EXISTING_FILE" > "$WORK_DIR/new_docids.txt"
  else
    cp "$WORK_DIR/matching_docids.txt" "$WORK_DIR/new_docids.txt"
  fi
  NEW_COUNT=$(wc -l < "$WORK_DIR/new_docids.txt")
  echo "[FLT] New doc_ids to import (not yet in edrsr_documents): $NEW_COUNT"

  if [ "$NEW_COUNT" -eq 0 ]; then
    echo "[SKIP] All matching doc_ids already in edrsr_documents"
    rm -rf "$WORK_DIR"
    continue
  fi

  # Filter the actual CSV rows to only include new doc_ids
  # Load new_docids into awk for fast lookup
  awk -F'\t' 'NR==FNR{ids[$1]=1; next} $1 in ids' "$WORK_DIR/new_docids.txt" "$WORK_DIR/range_filtered.csv" > "$FILTERED_FILE"
  IMPORT_COUNT=$(wc -l < "$FILTERED_FILE")
  echo "[IMP] Importing $IMPORT_COUNT documents in $THREADS threads..."

  # Split and parallel import
  CHUNK_SIZE=$(( (IMPORT_COUNT + THREADS - 1) / THREADS ))
  [ "$CHUNK_SIZE" -lt 1 ] && CHUNK_SIZE=1

  split -l "$CHUNK_SIZE" -d -a 3 "$FILTERED_FILE" "$WORK_DIR/chunk_"

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

  TOTAL_IMPORTED=$((TOTAL_IMPORTED + IMPORT_COUNT))
  echo "[OK] $YEAR done: $IMPORT_COUNT docs imported (running total: $TOTAL_IMPORTED)"

  # Cleanup work dir (keep ZIP for reuse)
  rm -rf "$WORK_DIR"
done

# Cleanup temp files
rm -f "$EXISTING_FILE" "$FT_IDS_FILE"

echo ""
echo "=== Verification ==="
run_psql -c "SELECT 'edrsr_documents' AS tbl, COUNT(*) FROM edrsr_documents;"
run_psql -c "SELECT 'matched' AS status, COUNT(*) FROM edrsr_fulltext f WHERE EXISTS (SELECT 1 FROM edrsr_documents e WHERE e.doc_id = f.doc_id);"
run_psql -c "SELECT 'unmatched' AS status, COUNT(*) FROM edrsr_fulltext f WHERE NOT EXISTS (SELECT 1 FROM edrsr_documents e WHERE e.doc_id = f.doc_id);"

echo ""
echo "=== Done! Total imported: $TOTAL_IMPORTED ==="
