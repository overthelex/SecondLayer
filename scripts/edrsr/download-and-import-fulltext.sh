#!/bin/bash
# Download RTF full texts from reyestr.court.gov.ua and import into edrsr_fulltext
#
# Usage: ./download-and-import-fulltext.sh [PARALLEL] [BATCH_SIZE]
#   PARALLEL  - number of concurrent downloads (default: 50)
#   BATCH_SIZE - DB import batch size (default: 1000)

set -euo pipefail

PARALLEL="${1:-50}"
BATCH_SIZE="${2:-1000}"
CONTAINER="${CONTAINER:-secondlayer-postgres-local}"
PGUSER="${PGUSER:-secondlayer}"
PGDATABASE="${PGDATABASE:-secondlayer_local}"

# NVMe fast storage
RTF_DIR="/tmp/edrsr-rtf-2025-2026"
WORK_DIR="/tmp/edrsr-download-work-$$"
mkdir -p "$RTF_DIR" "$WORK_DIR"

echo "=== ЄДРСР Fulltext Download & Import ==="
echo "Parallel downloads: $PARALLEL"
echo "RTF dir: $RTF_DIR"
echo "DB import batch: $BATCH_SIZE"
echo ""

# 1. Export doc_id + doc_url for 2025-2026 docs that have URLs and no fulltext yet
echo "[1/5] Exporting doc_id + doc_url list..."
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -Atc "
SELECT d.doc_id || '|' || d.doc_url
FROM edrsr_documents d
LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
WHERE d.adjudication_date >= '2025-01-01'
  AND d.doc_url IS NOT NULL AND d.doc_url != ''
  AND ft.doc_id IS NULL
ORDER BY d.doc_id;
" > "$WORK_DIR/urls.txt"

TOTAL=$(wc -l < "$WORK_DIR/urls.txt")
echo "  Documents to download: $TOTAL"

if [ "$TOTAL" -eq 0 ]; then
  echo "Nothing to download!"
  rm -rf "$WORK_DIR"
  exit 0
fi

# 2. Filter out already-downloaded RTFs
echo "[2/5] Filtering already downloaded..."
> "$WORK_DIR/todo.txt"
while IFS='|' read -r doc_id url; do
  if [ ! -f "$RTF_DIR/${doc_id}.rtf" ]; then
    echo "${doc_id}|${url}" >> "$WORK_DIR/todo.txt"
  fi
done < "$WORK_DIR/urls.txt"

TODO=$(wc -l < "$WORK_DIR/todo.txt")
ALREADY=$((TOTAL - TODO))
echo "  Already on disk: $ALREADY"
echo "  To download: $TODO"

# 3. Download with xargs + curl
echo "[3/5] Downloading RTFs ($PARALLEL parallel)..."

# Create download script
cat > "$WORK_DIR/download-one.sh" << 'DLEOF'
#!/bin/bash
IFS='|' read -r doc_id url <<< "$1"
rtf_dir="$2"
outfile="${rtf_dir}/${doc_id}.rtf"

# Skip if exists
[ -f "$outfile" ] && exit 0

# Download with retry
for attempt in 1 2 3; do
  http_code=$(curl -sS -o "$outfile" -w "%{http_code}" \
    --connect-timeout 10 --max-time 30 \
    "$url" 2>/dev/null)

  if [ "$http_code" = "200" ] && [ -s "$outfile" ]; then
    exit 0
  fi

  rm -f "$outfile"
  sleep $((attempt * 2))
done

# Failed after 3 attempts
echo "FAIL:${doc_id}:${http_code}" >&2
exit 0
DLEOF
chmod +x "$WORK_DIR/download-one.sh"

START_TIME=$(date +%s)

# Use xargs for parallel downloads with progress
cat "$WORK_DIR/todo.txt" | \
  xargs -P "$PARALLEL" -I {} bash "$WORK_DIR/download-one.sh" {} "$RTF_DIR" 2>"$WORK_DIR/failures.log" &

DL_PID=$!

# Progress monitor
while kill -0 $DL_PID 2>/dev/null; do
  DOWNLOADED=$(find "$RTF_DIR" -name '*.rtf' -newer "$WORK_DIR/todo.txt" 2>/dev/null | wc -l)
  EXISTING_RTF=$(ls "$RTF_DIR"/*.rtf 2>/dev/null | wc -l)
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ "$ELAPSED" -gt 0 ]; then
    RATE=$((DOWNLOADED / ELAPSED))
    if [ "$RATE" -gt 0 ]; then
      ETA=$(( (TODO - DOWNLOADED) / RATE ))
      echo -ne "\r  Downloaded: $EXISTING_RTF / $TOTAL | ${RATE}/s | ETA: ${ETA}s    "
    else
      echo -ne "\r  Downloaded: $EXISTING_RTF / $TOTAL | starting...    "
    fi
  fi
  sleep 5
done
wait $DL_PID || true

echo ""
EXISTING_RTF=$(ls "$RTF_DIR"/*.rtf 2>/dev/null | wc -l)
FAIL_COUNT=$(wc -l < "$WORK_DIR/failures.log" 2>/dev/null || echo 0)
DL_TIME=$(($(date +%s) - START_TIME))
echo "  Download complete: $EXISTING_RTF files on disk, ${FAIL_COUNT} failures, ${DL_TIME}s"

if [ -s "$WORK_DIR/failures.log" ]; then
  echo "  First 10 failures:"
  head -10 "$WORK_DIR/failures.log" | sed 's/^/    /'
fi

# 4. Convert RTF → text and batch import
echo "[4/5] Converting RTF → text and importing..."

# RTF to text converter
cat > "$WORK_DIR/rtf2csv.py" << 'PYEOF'
#!/usr/bin/env python3
"""Convert RTF files to CSV for PG COPY. Reads doc_ids from stdin."""
import sys, re, os, csv

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
    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
    except (IOError, OSError):
        return None
    text = raw.decode('latin1')
    for kw in ['fonttbl', 'colortbl', 'stylesheet', 'info', '*\\']:
        text = remove_nested_group(text, kw)
    text = re.sub(r'\\rtf1[^\\{]*', '', text)
    text = re.sub(r'\\par\b', '\n', text)
    text = re.sub(r'\\line\b', '\n', text)
    text = re.sub(r'\\tab\b', '\t', text)
    text = re.sub(r"\\'([0-9a-fA-F]{2})", decode_win1251_byte, text)
    text = re.sub(r'\\u(\d+)\??', decode_unicode, text)
    text = re.sub(r'\\[a-zA-Z]+-?\d*\s?', '', text)
    text = text.replace('{', '').replace('}', '')
    text = text.replace('\x00', '')
    text = text.replace('\r\n', '\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return text if text else None

def main():
    rtf_dir = sys.argv[1]
    writer = csv.writer(sys.stdout, quoting=csv.QUOTE_MINIMAL)
    count = 0
    for line in sys.stdin:
        doc_id = line.strip()
        if not doc_id:
            continue
        filepath = os.path.join(rtf_dir, f"{doc_id}.rtf")
        if not os.path.exists(filepath):
            continue
        text = rtf_to_text(filepath)
        if text:
            writer.writerow([doc_id, text])
            count += 1
    print(f"Converted: {count}", file=sys.stderr)

if __name__ == '__main__':
    main()
PYEOF

# Get list of downloaded RTFs that aren't imported yet
echo "  Building import list..."
ls "$RTF_DIR"/*.rtf 2>/dev/null | sed 's|.*/||; s|\.rtf$||' | sort -n > "$WORK_DIR/downloaded_ids.txt"

# Check which are already imported
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -Atc \
  "SELECT doc_id FROM edrsr_fulltext WHERE doc_id >= 133000000 ORDER BY doc_id;" > "$WORK_DIR/imported_ids.txt" 2>/dev/null || true

if [ -s "$WORK_DIR/imported_ids.txt" ]; then
  comm -23 "$WORK_DIR/downloaded_ids.txt" "$WORK_DIR/imported_ids.txt" > "$WORK_DIR/to_import.txt"
else
  cp "$WORK_DIR/downloaded_ids.txt" "$WORK_DIR/to_import.txt"
fi

IMPORT_TODO=$(wc -l < "$WORK_DIR/to_import.txt")
echo "  RTFs to convert+import: $IMPORT_TODO"

if [ "$IMPORT_TODO" -eq 0 ]; then
  echo "  Nothing to import!"
else
  # Split into batches
  split -l "$BATCH_SIZE" -d -a 5 "$WORK_DIR/to_import.txt" "$WORK_DIR/ibatch_"
  IBATCH_COUNT=$(ls "$WORK_DIR"/ibatch_* | wc -l)
  echo "  Import batches: $IBATCH_COUNT (${BATCH_SIZE} each)"

  IMPORT_START=$(date +%s)
  IDONE=0
  ITOTAL=0

  for batch in "$WORK_DIR"/ibatch_*; do
    batch_name=$(basename "$batch")

    # Convert RTF → CSV
    csv_file="${batch}.csv"
    python3 "$WORK_DIR/rtf2csv.py" "$RTF_DIR" < "$batch" > "$csv_file" 2>/dev/null

    if [ -s "$csv_file" ]; then
      converted=$(wc -l < "$csv_file")

      # Import via COPY
      docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -c \
        "COPY edrsr_fulltext(doc_id, full_text) FROM STDIN WITH (FORMAT csv);" < "$csv_file" 2>/dev/null

      ITOTAL=$((ITOTAL + converted))
    fi

    rm -f "$csv_file"
    IDONE=$((IDONE + 1))

    if [ $((IDONE % 10)) -eq 0 ] || [ "$IDONE" -eq "$IBATCH_COUNT" ]; then
      IELAPSED=$(($(date +%s) - IMPORT_START))
      echo "  Import progress: batch $IDONE/$IBATCH_COUNT, $ITOTAL records, ${IELAPSED}s"
    fi
  done
fi

# 5. Verification
echo ""
echo "[5/5] Verification..."
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -c "
SELECT
  count(*) AS total_fulltext,
  count(CASE WHEN doc_id >= 133000000 THEN 1 END) AS new_2025_2026,
  pg_size_pretty(pg_total_relation_size('edrsr_fulltext')) AS table_size
FROM edrsr_fulltext;
"

docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -c "
SELECT
  extract(year from d.adjudication_date) AS year,
  count(d.doc_id) AS total_docs,
  count(ft.doc_id) AS with_fulltext,
  round(100.0 * count(ft.doc_id) / count(d.doc_id), 1) AS pct
FROM edrsr_documents d
LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
WHERE d.adjudication_date >= '2025-01-01'
GROUP BY 1 ORDER BY 1;
"

TOTAL_TIME=$(($(date +%s) - START_TIME))
echo ""
echo "=== Done! Total time: ${TOTAL_TIME}s ==="
echo "RTF files stored at: $RTF_DIR"

# Cleanup work dir (keep RTFs)
rm -rf "$WORK_DIR"
