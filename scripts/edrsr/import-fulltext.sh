#!/bin/bash
# Import ЄДРСР RTF full texts into PostgreSQL (edrsr_fulltext table)
# Converts RTF → plaintext → batch COPY into PG
#
# Usage: ./import-fulltext.sh /media/vovkes/bulk-storage/edrsr/rtf2024 [BATCH_SIZE] [WORKERS]
#
# Requires: python3, docker with running postgres container

set -euo pipefail

RTF_DIR="${1:?Usage: $0 <rtf-dir> [batch-size] [workers]}"
BATCH_SIZE="${2:-5000}"
WORKERS="${3:-4}"
CONTAINER="${CONTAINER:-secondlayer-postgres-local}"
PGUSER="${PGUSER:-secondlayer}"
PGDATABASE="${PGDATABASE:-secondlayer_local}"

WORK_DIR="/tmp/edrsr-fulltext-import-$$"
mkdir -p "$WORK_DIR"

echo "=== ЄДРСР Fulltext Import ==="
echo "Source: $RTF_DIR"
echo "Batch size: $BATCH_SIZE, Workers: $WORKERS"
echo "Target: $CONTAINER / $PGDATABASE"
echo ""

# Verify table exists
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -Atc \
  "SELECT COUNT(*) FROM edrsr_fulltext;" >/dev/null 2>&1 || {
  echo "ERROR: edrsr_fulltext table does not exist. Run migration 075 first."
  exit 1
}

EXISTING=$(docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -Atc \
  "SELECT COUNT(*) FROM edrsr_fulltext;")
echo "Existing records: $EXISTING"

# Get list of RTF files, extract doc_ids, exclude already imported
echo "[1/4] Building file list..."
find "$RTF_DIR" -maxdepth 1 -name '*.rtf' -printf '%f\n' | sed 's/\.rtf$//' | sort -n > "$WORK_DIR/all_ids.txt"
TOTAL=$(wc -l < "$WORK_DIR/all_ids.txt")
echo "  Total RTF files: $TOTAL"

if [ "$EXISTING" -gt 0 ]; then
  echo "  Fetching already-imported doc_ids..."
  docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -Atc \
    "SELECT doc_id FROM edrsr_fulltext ORDER BY doc_id;" > "$WORK_DIR/done_ids.txt"
  comm -23 "$WORK_DIR/all_ids.txt" "$WORK_DIR/done_ids.txt" > "$WORK_DIR/todo_ids.txt"
else
  cp "$WORK_DIR/all_ids.txt" "$WORK_DIR/todo_ids.txt"
fi

TODO=$(wc -l < "$WORK_DIR/todo_ids.txt")
echo "  To import: $TODO"

if [ "$TODO" -eq 0 ]; then
  echo "Nothing to import!"
  rm -rf "$WORK_DIR"
  exit 0
fi

# Split into batches
echo "[2/4] Splitting into batches of $BATCH_SIZE..."
split -l "$BATCH_SIZE" -d -a 5 "$WORK_DIR/todo_ids.txt" "$WORK_DIR/batch_"
BATCH_COUNT=$(ls "$WORK_DIR"/batch_* | wc -l)
echo "  Batches: $BATCH_COUNT"

# Python RTF→text converter (same logic as document-parser.ts)
cat > "$WORK_DIR/rtf2csv.py" << 'PYEOF'
#!/usr/bin/env python3
"""Convert batch of RTF files to CSV (doc_id,full_text) for PG COPY CSV."""
import sys
import re
import os
import csv
import io

# Windows-1251 decoder for \'XX sequences
def decode_win1251_byte(match):
    byte_val = int(match.group(1), 16)
    if byte_val > 127:
        try:
            return bytes([byte_val]).decode('windows-1251')
        except:
            return chr(byte_val)
    return chr(byte_val)

def decode_unicode(match):
    code = int(match.group(1))
    if 0 <= code <= 0x10FFFF:
        return chr(code)
    return ''

def remove_nested_group(text, keyword):
    """Remove RTF group like {\\fonttbl ...{...}...} handling nested braces."""
    idx = text.find('{\\' + keyword)
    while idx != -1:
        depth = 0
        end = idx
        for i in range(idx, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        text = text[:idx] + text[end:]
        idx = text.find('{\\' + keyword)
    return text

def rtf_to_text(filepath):
    """Strip RTF control codes and return plain text."""
    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
    except (IOError, OSError):
        return None

    text = raw.decode('latin1')

    # Remove nested groups (handles nested braces properly)
    for kw in ['fonttbl', 'colortbl', 'stylesheet', 'info', '*\\']:
        text = remove_nested_group(text, kw)

    text = re.sub(r'\\rtf1[^\\{]*', '', text)

    text = re.sub(r'\\par\b', '\n', text)
    text = re.sub(r'\\line\b', '\n', text)
    text = re.sub(r'\\tab\b', '\t', text)

    # Decode \'XX hex escapes (Windows-1251)
    text = re.sub(r"\\'([0-9a-fA-F]{2})", decode_win1251_byte, text)
    # Decode \uNNNN unicode escapes
    text = re.sub(r'\\u(\d+)\??', decode_unicode, text)

    # Remove remaining control words
    text = re.sub(r'\\[a-zA-Z]+-?\d*\s?', '', text)
    text = text.replace('{', '').replace('}', '')

    # Clean whitespace and NUL bytes
    text = text.replace('\x00', '')
    text = text.replace('\r\n', '\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()

    return text if text else None


def main():
    rtf_dir = sys.argv[1]
    batch_file = sys.argv[2]

    writer = csv.writer(sys.stdout, quoting=csv.QUOTE_MINIMAL)

    with open(batch_file, 'r') as f:
        doc_ids = [line.strip() for line in f if line.strip()]

    for doc_id in doc_ids:
        filepath = os.path.join(rtf_dir, f"{doc_id}.rtf")
        text = rtf_to_text(filepath)
        if text:
            writer.writerow([doc_id, text])

if __name__ == '__main__':
    main()
PYEOF

# Import function for a single batch
import_batch() {
  local batch_file="$1"
  local batch_name=$(basename "$batch_file")
  local csv_file="${batch_file}.csv"
  local lines=$(wc -l < "$batch_file")

  # Convert RTF → TSV
  python3 "$WORK_DIR/rtf2csv.py" "$RTF_DIR" "$batch_file" > "$csv_file" 2>/dev/null

  if [ ! -s "$csv_file" ]; then
    echo "  [$batch_name] SKIP (empty output)"
    return
  fi

  local converted=$(grep -c '^[0-9]' "$csv_file" || echo 0)

  # COPY into PG
  docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -c \
    "COPY edrsr_fulltext(doc_id, full_text) FROM STDIN WITH (FORMAT csv);" < "$csv_file" 2>/dev/null

  echo "  [$batch_name] $converted/$lines imported"
  rm -f "$csv_file"
}
export -f import_batch
export WORK_DIR RTF_DIR CONTAINER PGUSER PGDATABASE

# Process batches with parallel workers
echo "[3/4] Importing (${WORKERS} workers)..."
START_TIME=$(date +%s)

DONE=0
TOTAL_BATCHES=$BATCH_COUNT

for batch in "$WORK_DIR"/batch_*; do
  # Wait if we have too many workers
  while [ $(jobs -r | wc -l) -ge "$WORKERS" ]; do
    wait -n 2>/dev/null || true
  done

  import_batch "$batch" &
  DONE=$((DONE + 1))

  # Progress every 20 batches
  if [ $((DONE % 20)) -eq 0 ]; then
    ELAPSED=$(($(date +%s) - START_TIME))
    RATE=$(echo "scale=0; $DONE * $BATCH_SIZE / ($ELAPSED + 1)" | bc 2>/dev/null || echo "?")
    echo "  Progress: $DONE/$TOTAL_BATCHES batches ($RATE docs/sec)"
  fi
done
wait

ELAPSED=$(($(date +%s) - START_TIME))

# Verification
echo "[4/4] Verification..."
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -c "
  SELECT
    COUNT(*) AS total_records,
    pg_size_pretty(pg_total_relation_size('edrsr_fulltext')) AS total_size,
    ROUND(AVG(text_length)) AS avg_chars,
    MIN(doc_id) AS min_doc_id,
    MAX(doc_id) AS max_doc_id
  FROM edrsr_fulltext;
"

echo ""
echo "=== Done! ${TODO} docs processed in ${ELAPSED}s ==="

# Cleanup
rm -rf "$WORK_DIR"
