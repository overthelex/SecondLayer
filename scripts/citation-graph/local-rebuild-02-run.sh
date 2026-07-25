#!/bin/bash
# =====================================================================
# local-rebuild-02-run.sh   (runs ON local / cthulhu, inside tmux/screen)
# Stage-2: launch the parallel extractor over ALL years into the staging
# tables created by local-rebuild-01-prep.sql.
#
# Benchmarked sweet spot on this box (16 cores, NVMe, 123 GB RAM):
#   W=14 -> ~10,582 rows/s   (W=8 ~8,188; W=16 oversubscribed, load 26)
# Full corpus (~120-140M decisions) => ~3.4-4 h of load wall-clock.
#
# DEFERRED pattern: --bulk-load (skip ON CONFLICT, append-only) +
#                   --no-enrich (skip per-year justice_kind UPDATE).
# Dedup + justice_kind enrichment are done once, after load, in finalize.
#
# ALWAYS run under tmux/screen — this is a multi-hour job:
#   tmux new -s citerebuild
#   ./local-rebuild-02-run.sh 2>&1 | tee local-rebuild-run.log
# =====================================================================
set -euo pipefail

WORKERS="${WORKERS:-14}"
CHUNK="${CHUNK:-100000}"      # bigger chunks than the 50K bench -> fewer OFFSET
                             # re-scans on the large recent-year partitions.
YEARS_FROM="${YEARS_FROM:-2007}"
YEARS_TO="${YEARS_TO:-2026}"

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"

# --- DB connection from deployment/.env.local -----------------------
ENV_FILE="$REPO_ROOT/deployment/.env.local"
PU=$(grep "^POSTGRES_USER=" "$ENV_FILE" | head -1 | cut -d= -f2-)
PW=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" | head -1 | cut -d= -f2-)
PD=$(grep "^POSTGRES_DB=" "$ENV_FILE" | head -1 | cut -d= -f2-)
export DATABASE_URL="host=localhost port=5432 dbname=$PD user=$PU password=$PW"

# --- guard: the local extractor MUST carry the deferred-load flags ---
# (main-branch extract-citations.py does NOT have them yet; the local copy
#  was patched. Abort loudly rather than silently doing an inline load.)
if ! python3 extract-citations.py --help 2>&1 | grep -q -- '--bulk-load'; then
  echo "FATAL: extract-citations.py here has no --bulk-load flag." >&2
  echo "       This box needs the deferred-load patched copy (flags:" >&2
  echo "       --bulk-load, --no-enrich). Restore it before running." >&2
  exit 1
fi

echo "=== Full citation rebuild (local, deferred bulk-load) ==="
echo "Years   : $YEARS_FROM-$YEARS_TO"
echo "Workers : $WORKERS   Chunk: $CHUNK"
echo "Sink    : lcc_bulk (statutes) + cce_bulk (case edges)"
echo "Start   : $(date -u +%FT%TZ)"
echo

nice -n 10 python3 extract-citations.py \
  --all --years-from "$YEARS_FROM" --years-to "$YEARS_TO" \
  --workers "$WORKERS" --chunk-size "$CHUNK" \
  --bulk-load --no-enrich \
  --target-table lcc_bulk --case-table cce_bulk

echo
echo "=== Load done: $(date -u +%FT%TZ) ==="
PSQL="docker exec secondlayer-postgres-local psql -U $PU -d $PD -tA"
echo "lcc_bulk raw rows: $($PSQL -c 'SELECT count(*) FROM lcc_bulk;')"
echo "cce_bulk raw rows: $($PSQL -c 'SELECT count(*) FROM cce_bulk;')"
echo "Next: psql -f local-rebuild-03-finalize.sql"
