#!/bin/bash
# =====================================================================
# brev-neo4j-02-export.sh   (runs ON brev, as postgres via peer)
# Export the RAW citation-graph node/edge tables built by
# brev-neo4j-01-build.sql into neo4j-admin `import full` CSVs (header in
# each file, gzip). Written into the Neo4j container import dir so
# neo4j-admin can read them directly.
#
#   sudo -u postgres bash brev-neo4j-02-export.sh
#
# Notes:
# - Header lines carry the neo4j-admin typing (:ID(space) / :START_ID / :END_ID
#   / :long) so `import full` needs no per-column flags beyond --nodes/--relationships.
# - PGOPTIONS disables mergejoin: on the big CITES_ARTICLE join, the planner
#   otherwise picks a doomed ~400M external merge sort (memory gotcha). psql -q
#   keeps "SET"/tag noise out of the CSV.
# - COPY ... CSV quotes + escapes citation_context (OCR newlines) -> pair with
#   neo4j-admin --multiline-fields=true on import.
# =====================================================================
set -euo pipefail

DB=edrsr_local
OUT=/data/neo4j/import                      # bind-mounted to the container's /import
sudo mkdir -p "$OUT"; sudo chown postgres "$OUT" 2>/dev/null || true
PG="psql -q -d $DB -v ON_ERROR_STOP=1"
export PGOPTIONS='-c enable_mergejoin=off -c work_mem=4GB'

emit () {  # emit <outfile.gz> <header> <copy-select-sql>
  local f="$1" hdr="$2" sql="$3"
  echo "  → $f"
  { printf '%s\n' "$hdr"; $PG -c "COPY ($sql) TO STDOUT WITH (FORMAT csv)"; } | gzip -1 > "$OUT/$f"
}

echo "=== node exports ==="
emit nodes_decision.csv.gz \
  'doc_id:ID(Decision)' \
  'SELECT doc_id FROM edrsr_documents'

emit nodes_article.csv.gz \
  'art_id:ID(Article),law_number,law_article,total_citations:long,unique_decisions:long' \
  'SELECT art_id, law_number, law_article, total_citations, unique_decisions FROM nb_article_kept'

emit nodes_law.csv.gz \
  'law_number:ID(Law)' \
  'SELECT law_number FROM nb_law'

emit nodes_case.csv.gz \
  'cause_num:ID(Case),member_count:long,latest_doc_id' \
  'SELECT cause_num, member_count, latest_doc_id FROM edrsr_case_index'

echo "=== relationship exports ==="
emit rels_cites_article.csv.gz \
  ':START_ID(Decision),:END_ID(Article),citation_type,citation_context' \
  'SELECT l.court_case_id, a.art_id, l.citation_type, l.citation_context
     FROM lcc_final l JOIN nb_article_kept a USING (law_number, law_article)'

emit rels_of_law.csv.gz \
  ':START_ID(Article),:END_ID(Law)' \
  'SELECT art_id, law_number FROM nb_article_kept'

emit rels_in_case.csv.gz \
  ':START_ID(Decision),:END_ID(Case)' \
  "SELECT doc_id, cause_num FROM edrsr_documents WHERE cause_num IS NOT NULL AND cause_num <> ''"

emit rels_cites_case.csv.gz \
  ':START_ID(Decision),:END_ID(Case),weight:long' \
  'SELECT from_case_id, to_case_number, 1 FROM case_citation_links WHERE resolved AND NOT is_self_citation'

echo "=== sizes ==="
ls -lh "$OUT"/*.csv.gz
