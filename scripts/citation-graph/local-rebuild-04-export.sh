#!/bin/bash
# =====================================================================
# local-rebuild-04-export.sh   (runs ON local / cthulhu)
# Stage-4: dump the clean lcc_final / cce_final tables to gzipped CSV and
# ship them to prod. local -> prod is the SANCTIONED data direction
# (never prod/AWS -> local; egress is paid). Two transfer modes below;
# pick one with TRANSFER=s3 (default) or TRANSFER=scp.
#
# CSV (not text) so embedded delimiters/newlines in citation_context are
# safely quoted. Column order matches the prod load (id/created_at omitted,
# filled by DEFAULT on COPY FROM).
#
# Run:
#   OUTDIR=/data/citation-export TRANSFER=s3 S3_URI=s3://<bucket>/citerebuild \
#     ./local-rebuild-04-export.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
ENV_FILE="$REPO_ROOT/deployment/.env.local"
PU=$(grep "^POSTGRES_USER=" "$ENV_FILE" | head -1 | cut -d= -f2-)
PD=$(grep "^POSTGRES_DB=" "$ENV_FILE" | head -1 | cut -d= -f2-)

OUTDIR="${OUTDIR:-/data/citation-export}"
TRANSFER="${TRANSFER:-s3}"
mkdir -p "$OUTDIR"
PSQL="docker exec -i secondlayer-postgres-local psql -U $PU -d $PD"

echo "=== Exporting clean citation tables -> $OUTDIR ==="

# Stream COPY straight through gzip. The column list is the contract with the
# prod loader (prod-load-02-copy-index.sh expects exactly these orders).
$PSQL -c "\copy (SELECT court_case_id, citation_type, law_number, law_article, citation_context, justice_kind, adj_year FROM lcc_final) TO STDOUT WITH (FORMAT csv)" \
  | gzip -1 > "$OUTDIR/lcc_final.csv.gz"
echo "  lcc_final.csv.gz : $(du -h "$OUTDIR/lcc_final.csv.gz" | cut -f1)"

$PSQL -c "\copy (SELECT from_case_id, to_case_number, citation_context, justice_kind, adj_year FROM cce_final) TO STDOUT WITH (FORMAT csv)" \
  | gzip -1 > "$OUTDIR/cce_final.csv.gz"
echo "  cce_final.csv.gz : $(du -h "$OUTDIR/cce_final.csv.gz" | cut -f1)"

# Row-count manifest so the prod side can verify a complete transfer/load.
$PSQL -tA -c "SELECT 'lcc_final', count(*) FROM lcc_final UNION ALL SELECT 'cce_final', count(*) FROM cce_final" \
  > "$OUTDIR/MANIFEST.txt"
cat "$OUTDIR/MANIFEST.txt"

echo "=== Transfer ($TRANSFER) ==="
case "$TRANSFER" in
  s3)
    : "${S3_URI:?set S3_URI=s3://bucket/prefix}"
    # local -> S3 (eu-central-1). aws creds from the box's environment/role.
    aws s3 cp "$OUTDIR/lcc_final.csv.gz" "$S3_URI/lcc_final.csv.gz"
    aws s3 cp "$OUTDIR/cce_final.csv.gz" "$S3_URI/cce_final.csv.gz"
    aws s3 cp "$OUTDIR/MANIFEST.txt"     "$S3_URI/MANIFEST.txt"
    echo "Uploaded to $S3_URI . On prod: aws s3 cp --recursive $S3_URI ./"
    ;;
  scp)
    : "${PROD_SSH:?set PROD_SSH=user@prod-host (a route reachable FROM this box)}"
    : "${PROD_DIR:=/tmp/citation-export}"
    ssh "$PROD_SSH" "mkdir -p $PROD_DIR"
    scp "$OUTDIR/lcc_final.csv.gz" "$OUTDIR/cce_final.csv.gz" "$OUTDIR/MANIFEST.txt" "$PROD_SSH:$PROD_DIR/"
    echo "Copied to $PROD_SSH:$PROD_DIR"
    ;;
  none)
    echo "Files staged in $OUTDIR; transfer manually."
    ;;
  *) echo "Unknown TRANSFER=$TRANSFER (use s3|scp|none)"; exit 1 ;;
esac
