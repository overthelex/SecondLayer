#!/usr/bin/env bash
#
# build-lexeme-df-parallel.sh — parallel rebuild of edrsr_lexeme_df on the LOCAL
# EDRSR proxy (edrsr_all), sharded by year-partition.
#
# WHY: the single-pass build (scripts/edrsr/build-lexeme-df.sql) runs ts_stat in
# ONE backend — CPU-bound on to_tsvector, ~40-70 min for a 3% sample of ~101M
# rows while 3 of 4 cores idle. ts_stat / TABLESAMPLE do not use native parallel
# query, so we parallelise BY HAND: one worker per year-partition (capped at
# $WORKERS concurrent), each computing a partial lexeme document-frequency over a
# SYSTEM(pct) sample of its partition into a staging table; then a single merge
# sums df per lexeme and sums the per-shard sample sizes.
#
# Correctness: document frequency is additive over disjoint partitions, and the
# total sample size is the sum of per-shard sampled-doc counts. IDF is computed
# at read time as ln(sample_docs / df) (see EdsrFtsService.lexemeDf), so storing
# summed df + summed sample_docs is exact. Sharding by partition also yields a
# YEAR-STRATIFIED sample (more representative than block-SYSTEM on the parent).
#
# Local note: edrsr_all.edrsr_fulltext has NO tsv column (tsv lives only on prod),
# so we tokenise with to_tsvector('simple', full_text) on the fly — the expensive
# step this script parallelises. On prod (where tsv exists) prefer the single-pass
# build over the precomputed tsv, which needs no tokenisation.
#
# Floor semantics: per-shard floor keeps lexemes with ndoc >= $SHARD_FLOOR (drops
# per-shard hapax/OCR); the merge then applies the GLOBAL floor sum(df) >= $DF_MIN
# to match the single-pass `ndoc >= 3`. A term with 1 occurrence in each of three
# shards (global df=3) is the only edge dropped vs the single-pass build — a
# negligible difference for an IDF table.
#
# Usage (on the workstation / local proxy):
#   scripts/edrsr/build-lexeme-df-parallel.sh
#   PCT=5 WORKERS=4 scripts/edrsr/build-lexeme-df-parallel.sh
#
# Env:
#   DB           target database          (default: edrsr_all)
#   PCT          TABLESAMPLE SYSTEM pct   (default: 3)
#   SEED         REPEATABLE seed          (default: 42)
#   WORKERS      max concurrent shards    (default: nproc-1, min 1)
#   SHARD_FLOOR  per-shard ndoc floor     (default: 2)
#   DF_MIN       global df floor at merge (default: 3)
#   PSQL         psql command             (default: "sudo -n -u postgres psql")
#   LOGDIR       per-shard log dir        (default: /tmp/lexeme_build)

set -euo pipefail

export DB="${DB:-edrsr_all}"
export PCT="${PCT:-3}"
export SEED="${SEED:-42}"
WORKERS="${WORKERS:-$(( $(nproc) > 1 ? $(nproc) - 1 : 1 ))}"
export SHARD_FLOOR="${SHARD_FLOOR:-2}"
DF_MIN="${DF_MIN:-3}"
export PSQL="${PSQL:-sudo -n -u postgres psql}"
export LOGDIR="${LOGDIR:-/tmp/lexeme_build}"

mkdir -p "$LOGDIR"

echo "[build] DB=$DB PCT=$PCT SEED=$SEED WORKERS=$WORKERS SHARD_FLOOR=$SHARD_FLOOR DF_MIN=$DF_MIN"
echo "[build] started $(date -Is)"

# ---------------------------------------------------------------------------
# 0. Staging tables (UNLOGGED — transient, faster, crash-discardable)
# ---------------------------------------------------------------------------
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
CREATE TABLE IF NOT EXISTS edrsr_lexeme_df (
  lexeme TEXT PRIMARY KEY, df BIGINT NOT NULL,
  sample_docs BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TABLE IF EXISTS edrsr_lexeme_df_stage;
DROP TABLE IF EXISTS edrsr_lexeme_df_shardmeta;
CREATE UNLOGGED TABLE edrsr_lexeme_df_stage     (part TEXT, lexeme TEXT, df BIGINT);
CREATE UNLOGGED TABLE edrsr_lexeme_df_shardmeta (part TEXT PRIMARY KEY, sample_docs BIGINT);
SQL

# ---------------------------------------------------------------------------
# 1. Discover non-empty year partitions of edrsr_fulltext (biggest first →
#    better job-pool packing)
# ---------------------------------------------------------------------------
mapfile -t PARTS < <($PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAc "
  SELECT c.relname
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  JOIN pg_class p ON p.oid = i.inhparent
  WHERE p.relname = 'edrsr_fulltext' AND c.reltuples > 0
  ORDER BY c.reltuples DESC")

if [ "${#PARTS[@]}" -eq 0 ]; then echo "[build] no partitions found" >&2; exit 1; fi
echo "[build] ${#PARTS[@]} partitions: ${PARTS[*]}"

# ---------------------------------------------------------------------------
# 2. Per-shard worker — partial DF + sample size for ONE partition.
#    Exported for the xargs subshells. Reads config from the environment;
#    $part is a discovered relname (never user input) → safe to inline.
# ---------------------------------------------------------------------------
shard() {
  local part="$1" log="$LOGDIR/$1.log"
  {
    echo "[$part] start $(date -Is)"
    $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
SET client_min_messages = error;   -- silence "word too long" NOTICEs
INSERT INTO edrsr_lexeme_df_shardmeta(part, sample_docs)
SELECT '$part', count(*)::bigint
  FROM $part TABLESAMPLE SYSTEM ($PCT) REPEATABLE ($SEED);
INSERT INTO edrsr_lexeme_df_stage(part, lexeme, df)
SELECT '$part', s.word, s.ndoc
FROM ts_stat(\$\$SELECT to_tsvector('simple', full_text)
               FROM $part TABLESAMPLE SYSTEM ($PCT) REPEATABLE ($SEED)\$\$)
     AS s(word, ndoc, nentry)
WHERE s.ndoc >= $SHARD_FLOOR;
SQL
    echo "[$part] done  $(date -Is)"
  } >"$log" 2>&1
}
export -f shard

# ---------------------------------------------------------------------------
# 3. Run shards with a bounded job pool ($WORKERS concurrent)
# ---------------------------------------------------------------------------
printf '%s\n' "${PARTS[@]}" | xargs -d '\n' -P "$WORKERS" -I{} bash -c 'shard "$@"' _ {}
echo "[build] all shards done $(date -Is)"

# ---------------------------------------------------------------------------
# 4. Merge — sum df per lexeme, sum per-shard sample sizes
# ---------------------------------------------------------------------------
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
SET statement_timeout = '30min';
BEGIN;
TRUNCATE edrsr_lexeme_df;
INSERT INTO edrsr_lexeme_df (lexeme, df, sample_docs, updated_at)
SELECT st.lexeme, sum(st.df)::bigint,
       (SELECT coalesce(sum(sample_docs),0) FROM edrsr_lexeme_df_shardmeta),
       NOW()
FROM edrsr_lexeme_df_stage st
GROUP BY st.lexeme
HAVING sum(st.df) >= $DF_MIN;
COMMIT;
ANALYZE edrsr_lexeme_df;
DROP TABLE IF EXISTS edrsr_lexeme_df_stage;
DROP TABLE IF EXISTS edrsr_lexeme_df_shardmeta;
SQL

# ---------------------------------------------------------------------------
# 5. Summary + sanity (domain anchors must outrank colloquial junk)
# ---------------------------------------------------------------------------
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAc \
  "SELECT 'lexemes='||count(*)||' sample_docs='||max(sample_docs) FROM edrsr_lexeme_df;"
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -tAc "
  SELECT k||' df='||coalesce((SELECT sum(df) FROM edrsr_lexeme_df WHERE lexeme LIKE k||'%'),0)
  FROM (VALUES ('окупован'),('нерухом'),('оподаткув'),('зіткнен'),('сумуван'),('дррп')) v(k);"
echo "[build] finished $(date -Is)"
