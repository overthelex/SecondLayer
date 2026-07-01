#!/bin/bash
# =====================================================================
# qdrant-prep-resolved.sh   (runs ON qdrant.lex)   NON-DESTRUCTIVE
# Assemble the neo4j-admin import fileset for the RESOLVED article-layer
# rebuild, preserving the live Case layer (Case / CITES_CASE / DEPARTS_FROM).
#
# Inputs already in /home/ubuntu/neo4j/import (transferred from local):
#   laws.csv.gz, articles.csv.gz, cites.csv.gz, of_law.csv.gz
# Produced here from the LIVE graph (read-only) + on-disk Case CSV:
#   cases.csv          (fresh export, full fidelity incl. departs-only cases)
#   departs_from.csv   (fresh export)
#   cites_case.csv     (reuse on-disk data, reheadered)  [verified vs live count]
#   decisions.csv      (union of all edge START_IDs)
#
# Does NOT touch the running DB. Run qdrant-run-import-resolved.sh afterwards.
# =====================================================================
set -euo pipefail
IMP=/home/ubuntu/neo4j/import
PW=R5r6JBLEVi8NfneX7n6DHn
CS() { docker exec neo4j cypher-shell -u neo4j -p "$PW" --format plain "$1"; }

echo "=== 0. sanity: transferred local files present ==="
for f in laws articles cites of_law; do
  [ -s "$IMP/$f.csv.gz" ] || { echo "MISSING $IMP/$f.csv.gz — transfer from local first"; exit 1; }
done
ls -lh "$IMP"/{laws,articles,cites,of_law}.csv.gz

echo "=== 1. export Case nodes (fresh, full) ==="
{ echo "cause_num:ID(Case),member_count:long,latest_doc_id"
  CS "MATCH (c:Case) RETURN c.cause_num + ',' + toString(coalesce(c.member_count,0)) + ',' + coalesce(toString(c.latest_doc_id),'') AS l" \
    | tail -n +2 | sed 's/^\"//; s/\"$//'
} > "$IMP/cases.csv"
echo "cases.csv rows: $(($(wc -l < "$IMP/cases.csv")-1))"

echo "=== 2. export DEPARTS_FROM (fresh) ==="
{ echo ":START_ID(Decision),:END_ID(Case),departed_on"
  CS "MATCH (d:Decision)-[r:DEPARTS_FROM]->(c:Case) RETURN toString(d.doc_id) + ',' + c.cause_num + ',' + coalesce(toString(r.departed_on),'') AS l" \
    | tail -n +2 | sed 's/^\"//; s/\"$//'
} > "$IMP/departs_from.csv"
echo "departs_from.csv rows: $(($(wc -l < "$IMP/departs_from.csv")-1))"

echo "=== 3. CITES_CASE: verify on-disk cites_case.csv vs live, reheader ==="
LIVE_CC=$(CS "MATCH ()-[r:CITES_CASE]->() RETURN count(r) AS c" | tail -n +2 | tr -d ' ')
DISK_CC=$(($(wc -l < "$IMP/cites_case.csv")-1))
echo "live CITES_CASE=$LIVE_CC  on-disk cites_case.csv(data rows)=$DISK_CC"
# on-disk header is 'from_doc_id,cause_num'; reheader to admin format into a new file
{ echo ":START_ID(Decision),:END_ID(Case)"; tail -n +2 "$IMP/cites_case.csv"; } > "$IMP/cites_case_admin.csv"
if [ "$LIVE_CC" != "$DISK_CC" ]; then
  echo "!! count mismatch — exporting CITES_CASE fresh instead"
  { echo ":START_ID(Decision),:END_ID(Case)"
    CS "MATCH (d:Decision)-[:CITES_CASE]->(c:Case) RETURN toString(d.doc_id) + ',' + c.cause_num AS l" \
      | tail -n +2 | sed 's/^\"//; s/\"$//'
  } > "$IMP/cites_case_admin.csv"
  echo "fresh cites_case_admin rows: $(($(wc -l < "$IMP/cites_case_admin.csv")-1))"
fi

echo "=== 4. assemble decisions.csv = sort -u of all edge START/END-decision ids ==="
{ zcat "$IMP/cites.csv.gz"      | tail -n +2 | cut -d, -f1
  tail -n +2 "$IMP/cites_case_admin.csv" | cut -d, -f1
  tail -n +2 "$IMP/departs_from.csv"     | cut -d, -f1
} | LC_ALL=C sort -u -S 20G --parallel=8 -T "$IMP" > "$IMP/_dec_ids.tmp"
{ echo "doc_id:ID(Decision)"; cat "$IMP/_dec_ids.tmp"; } > "$IMP/decisions.csv"
rm -f "$IMP/_dec_ids.tmp"
echo "decisions.csv rows: $(($(wc -l < "$IMP/decisions.csv")-1))"

echo "=== 5. final fileset ==="
ls -lh "$IMP"/{decisions.csv,laws.csv.gz,articles.csv.gz,cases.csv,cites.csv.gz,of_law.csv.gz,cites_case_admin.csv,departs_from.csv}
echo "PREP DONE — review counts, then run qdrant-run-import-resolved.sh"
