#!/bin/bash
# =====================================================================
# prod-load-02-copy.sh   (runs ON prod)
# Stream the gzipped CSV export into the prepared (TRUNCATEd, index-free)
# prod tables. Run AFTER prod-load-01-prep.sql, BEFORE prod-load-03-finalize.sql.
#
# Fetch the files first (S3 example):
#   aws s3 cp --recursive s3://<bucket>/citerebuild /tmp/citation-export
#
# Run:
#   INDIR=/tmp/citation-export ./prod-load-02-copy.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
ENV_FILE="$REPO_ROOT/deployment/.env.prod"
PU=$(grep "^POSTGRES_USER=" "$ENV_FILE" | head -1 | cut -d= -f2-)
PD=$(grep "^POSTGRES_DB=" "$ENV_FILE" | head -1 | cut -d= -f2-)
INDIR="${INDIR:-/tmp/citation-export}"

# prod postgres container name (adjust if the compose service differs).
PGC="${PGC:-secondlayer-postgres-prod}"
PSQL="docker exec -i $PGC psql -U $PU -d $PD"

echo "=== COPY into prod (index-free heap append) ==="
echo "Source: $INDIR"
[ -f "$INDIR/MANIFEST.txt" ] && { echo "Expected row counts:"; cat "$INDIR/MANIFEST.txt"; }

echo "-> law_court_citations"
# FORCE_NOT_NULL: on export, empty-string fields (e.g. law_article='' for
# supreme_court_ruling / law_by_number rows) become bare CSV fields; on import
# CSV treats a bare empty field as NULL, which violates the NOT NULL on
# law_number/law_article. FORCE_NOT_NULL keeps them as '' (matching the source).
gunzip -c "$INDIR/lcc_final.csv.gz" | $PSQL -c \
  "COPY law_court_citations (court_case_id, citation_type, law_number, law_article, citation_context, justice_kind, adj_year) FROM STDIN WITH (FORMAT csv, FORCE_NOT_NULL (law_number, law_article, citation_context))"

echo "-> case_citation_edges"
gunzip -c "$INDIR/cce_final.csv.gz" | $PSQL -c \
  "COPY case_citation_edges (from_case_id, to_case_number, citation_context, justice_kind, adj_year) FROM STDIN WITH (FORMAT csv, FORCE_NOT_NULL (to_case_number, citation_context))"

echo "=== Loaded row counts (verify against MANIFEST) ==="
$PSQL -tA -c "SELECT 'law_court_citations', count(*) FROM law_court_citations UNION ALL SELECT 'case_citation_edges', count(*) FROM case_citation_edges"
echo "Next: psql -f prod-load-03-finalize.sql"
