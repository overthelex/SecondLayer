#!/bin/bash
# Download all court session revisions from data.gov.ua
# Usage: ./download-court-sessions.sh [WORKERS] [START_LINE]
# Each revision is a daily snapshot of "Список справ призначених до розгляду"
# Total: 2081 revisions (~550GB), stored on /media/vovkes/bulk-storage/

set -euo pipefail

WORKERS="${1:-6}"
START_LINE="${2:-1}"
MAX_TOTAL_RATE_KBPS=37500  # 300 Mbit/s = ~37500 KB/s total
DEST_DIR="/media/vovkes/bulk-storage/court-sessions-revisions"
MANIFEST="$DEST_DIR/revisions-manifest.tsv"
LOG_DIR="$DEST_DIR/logs"
PROGRESS_FILE="$DEST_DIR/.download-progress"

mkdir -p "$DEST_DIR" "$LOG_DIR"

if [ ! -f "$MANIFEST" ]; then
    echo "ERROR: Manifest not found at $MANIFEST"
    exit 1
fi

TOTAL=$(wc -l < "$MANIFEST")
echo "=== Court Sessions Revision Downloader ==="
echo "Total revisions: $TOTAL"
echo "Workers: $WORKERS"
echo "Start from line: $START_LINE"
echo "Destination: $DEST_DIR"
echo ""

# Count already downloaded
DONE=$(find "$DEST_DIR" -name "*.csv" -size +1000c 2>/dev/null | wc -l)
echo "Already downloaded: $DONE / $TOTAL"
echo ""

download_one() {
    local line_num="$1"
    local line
    line=$(sed -n "${line_num}p" "$MANIFEST")

    local url date_part created size_expected
    url=$(echo "$line" | cut -f1)
    date_part=$(echo "$line" | cut -f2)
    created=$(echo "$line" | cut -f3)
    size_expected=$(echo "$line" | cut -f4)

    # Convert date_part like 03032026_1 to 2026-03-03
    local day=${date_part:0:2}
    local month=${date_part:2:2}
    local year=${date_part:4:4}
    local outfile="$DEST_DIR/${year}-${month}-${day}.csv"

    # Skip if already downloaded and correct size
    if [ -f "$outfile" ]; then
        local actual_size
        actual_size=$(stat -c%s "$outfile" 2>/dev/null || echo 0)
        if [ "$actual_size" -eq "$size_expected" ] 2>/dev/null; then
            echo "[SKIP] $outfile (${actual_size} bytes OK)"
            return 0
        elif [ "$actual_size" -gt 1000000 ] && [ "$size_expected" -eq 0 ]; then
            # size_expected unknown but file exists and is large
            echo "[SKIP] $outfile (${actual_size} bytes, no expected size)"
            return 0
        fi
    fi

    # Per-worker rate limit: total / workers
    local rate_limit=$(( MAX_TOTAL_RATE_KBPS / WORKERS ))k

    echo "[DOWN] #${line_num}/${TOTAL} → ${year}-${month}-${day}.csv ($(( size_expected / 1024 / 1024 ))MB) @${rate_limit}/s"

    local tmp="$outfile.tmp"
    local retries=0
    local max_retries=3

    while [ $retries -lt $max_retries ]; do
        if curl -sS -L --connect-timeout 30 --max-time 1200 \
            --limit-rate "$rate_limit" \
            -o "$tmp" "$url" 2>"$LOG_DIR/${year}-${month}-${day}.err"; then

            local dl_size
            dl_size=$(stat -c%s "$tmp" 2>/dev/null || echo 0)

            if [ "$dl_size" -gt 1000000 ]; then
                mv "$tmp" "$outfile"
                echo "[DONE] ${year}-${month}-${day}.csv ($(( dl_size / 1024 / 1024 ))MB)"
                echo "${line_num} ${year}-${month}-${day} OK ${dl_size}" >> "$PROGRESS_FILE"
                return 0
            else
                echo "[WARN] ${year}-${month}-${day}.csv too small (${dl_size} bytes), retry $((retries+1))"
            fi
        else
            echo "[ERR]  ${year}-${month}-${day}.csv curl failed, retry $((retries+1))"
        fi

        retries=$((retries + 1))
        sleep $((retries * 5))
    done

    echo "[FAIL] ${year}-${month}-${day}.csv after $max_retries retries"
    echo "${line_num} ${year}-${month}-${day} FAIL" >> "$PROGRESS_FILE"
    rm -f "$tmp"
    return 1
}

export -f download_one
export MANIFEST DEST_DIR LOG_DIR PROGRESS_FILE TOTAL MAX_TOTAL_RATE_KBPS WORKERS

# Generate line numbers for remaining downloads
seq "$START_LINE" "$TOTAL" | xargs -P "$WORKERS" -I{} bash -c 'download_one {}' || true

echo ""
echo "=== Download complete ==="
DONE_FINAL=$(find "$DEST_DIR" -name "*.csv" -size +1000c 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$DEST_DIR" 2>/dev/null | cut -f1)
echo "Downloaded: $DONE_FINAL / $TOTAL"
echo "Total size: $TOTAL_SIZE"

# Check for failures
if [ -f "$PROGRESS_FILE" ]; then
    FAILS=$(grep -c "FAIL" "$PROGRESS_FILE" 2>/dev/null || echo 0)
    if [ "$FAILS" -gt 0 ]; then
        echo "Failed: $FAILS (check $PROGRESS_FILE)"
    fi
fi
