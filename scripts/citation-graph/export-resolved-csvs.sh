#!/bin/bash
# =====================================================================
# export-resolved-csvs.sh   (runs ON local / cthulhu)
# Export the RESOLVED id-keyed article layer from legislation_citation_links
# into neo4j-admin import CSVs (gzipped). Source = clean local rebuild
# (lcc_final -> resolve-lcl-local.sql -> legislation_citation_links) joined to
# citrebuild.legislation / legislation_articles (prod copies).
#
# Node id spaces (import uses --id-type=string with groups):
#   Article : art_id = legislation_articles.id (latest edition per law+article)
#   Law     : legislation_id
#   Decision: doc_id  (decisions.csv assembled on qdrant.lex from edge START_IDs)
#
# citation_context is intentionally DROPPED from CITES_ARTICLE (unused by
# CitationGraphService, ~7GB of OCR text). citation_type is kept.
#
# Output: ~/neo4j_export_resolved/{laws,articles,of_law,cites}.csv.gz
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
# extract only the POSTGRES_* vars (the full .env.local has a value with a bare
# space on line 79 that breaks `source` under set -e).
set -a; eval "$(grep -E '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB)=' "$REPO_ROOT/deployment/.env.local")"; set +a
# work_mem via PGOPTIONS (connection-time GUC) — NOT a `-c "SET ..."`, because
# psql prints a "SET" command tag to stdout that would leak into the \copy CSV
# stream (it did, once — a stray "SET" node had to be scrubbed from the graph).
run() { docker exec -e PGOPTIONS="-c work_mem=24GB" -i secondlayer-postgres-local \
          psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 -c "$1"; }
OUT=~/neo4j_export_resolved
mkdir -p "$OUT"

echo "=== laws.csv.gz ==="
( echo "legislation_id:ID(Law),title,short_title"
  run "\copy (
    SELECT le.id, le.title, le.short_title
    FROM citrebuild.legislation le
    WHERE le.id IN (SELECT DISTINCT legislation_id FROM legislation_citation_links WHERE resolved)
  ) TO STDOUT WITH (FORMAT csv)"
) | gzip > "$OUT/laws.csv.gz"

echo "=== articles.csv.gz ==="
( echo "art_id:ID(Article),legislation_id:long,article_number,title,total_citations:long,unique_decisions:long"
  run "\copy (
    SELECT l.article_id, l.legislation_id, l.article_number, a.title,
           count(*) AS total_citations, count(DISTINCT l.doc_id) AS unique_decisions
    FROM legislation_citation_links l
    JOIN citrebuild.legislation_articles a ON a.id = l.article_id
    WHERE l.resolved
    GROUP BY l.article_id, l.legislation_id, l.article_number, a.title
  ) TO STDOUT WITH (FORMAT csv)"
) | gzip > "$OUT/articles.csv.gz"

echo "=== of_law.csv.gz ==="
( echo ":START_ID(Article),:END_ID(Law)"
  run "\copy (
    SELECT DISTINCT article_id, legislation_id
    FROM legislation_citation_links WHERE resolved
  ) TO STDOUT WITH (FORMAT csv)"
) | gzip > "$OUT/of_law.csv.gz"

echo "=== cites.csv.gz (dedup doc_id->article_id) ==="
( echo ":START_ID(Decision),:END_ID(Article),citation_type"
  run "\copy (
    SELECT DISTINCT ON (doc_id, article_id) doc_id, article_id, citation_type
    FROM legislation_citation_links WHERE resolved
    ORDER BY doc_id, article_id
  ) TO STDOUT WITH (FORMAT csv)"
) | gzip > "$OUT/cites.csv.gz"

echo "=== sizes ==="; ls -lh "$OUT"
echo "=== row counts (data rows) ==="
for f in laws articles of_law cites; do
  echo -n "$f: "; zcat "$OUT/$f.csv.gz" | tail -n +2 | wc -l
done
