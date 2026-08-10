#!/usr/bin/env bash
# Stage 0/1 source: download Rada open-data bulk files (sanctioned, no Cloudflare).
# Must run from an IP allowed by data.rada.gov.ua (prod Frankfurt or local Kyiv; NOT Brev/GCP).
set -euo pipefail

OUT="${1:-/data/rada_npa/bulk}"
BASE="https://data.rada.gov.ua/ogd/zak/laws"
UA="OpenData"
mkdir -p "$OUT"
cd "$OUT"

echo "[00] downloading Rada open-data bulk to $OUT"
# document cards, flat history events, dictionaries
curl -fsSL -A "$UA" -o doc.zip        "$BASE/data/csv/doc.zip"
curl -fsSL -A "$UA" -o doc-dates.zip  "$BASE/data/csv/doc-dates.zip"
curl -fsSL -A "$UA" -o podia.txt      "$BASE/data/csv/podia.txt"
curl -fsSL -A "$UA" -o stan.txt       "$BASE/data/csv/stan.txt"
curl -fsSL -A "$UA" -o typ.txt        "$BASE/data/csv/typ.txt"

unzip -o -q doc.zip
unzip -o -q doc-dates.zip

echo "[00] doc.txt rows:        $(wc -l < doc.txt)"
echo "[00] doc-dates.txt rows:  $(wc -l < doc-dates.txt)"
echo "[00] done"
