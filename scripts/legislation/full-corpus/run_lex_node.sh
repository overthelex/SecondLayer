#!/usr/bin/env bash
# Stage-2 fetch node on local.lex (cthulhu), a Ukrainian-IP box outside AWS.
#
# Why it exists: zakon.rada rate-limits our AWS EIPs into uselessness (measured 0.045 req/s
# persisted, ~90% transient, ZERO 200s), but answers the Ukrainian IP at 4.24 req/s with zero
# transients. That is ~1.5x the entire prod fleet, and it lands on a different origin than
# data.rada, so it does not compete with prod's OpenData nodes at all.
#
# Work split: prod reserves hash partitions 0..LEX_SHARE-1 for this node (see the matching
# `part()` in run_fetch_multiip.sh) and this node takes ONLY those, so neither side can fetch
# the other's rows and no locking is needed. This node must keep its heartbeat fresh or prod
# reclaims the partitions on its next round.
#
# Direction of traffic matters: results go local -> AWS (ingress, free). Never rsync prod's
# texts down here in bulk; only the small pending list and done-sets come down.
#
# Run detached:  setsid nohup ./run_lex_node.sh </dev/null >>/data/rada_lex/lex.log 2>&1 &
set -uo pipefail

REMOTE=${REMOTE:-prod}
RBASE=/data/rada_npa                       # data lives on the big volume...
RSCRIPTS=${RSCRIPTS:-rada_npa/scripts}     # ...but the scripts live in prod's homedir.
                                           # Relative: scp resolves it against the remote home,
                                           # whereas "$HOME/..." would be expanded locally.
BASE=${BASE:-/data/rada_lex}
SCRIPT=$BASE/03_fetch_texts.py
LEX_SHARE=${LEX_SHARE:-15}          # MUST match run_fetch_multiip.sh (see the note there)
RATE=${RATE:-5.0}                  # 4.24/s achieved with zero transients; raise only on evidence
WORKERS=${WORKERS:-8}              # zakon challenges above ~10 concurrent per IP - stay under
PUSH_EVERY=${PUSH_EVERY:-300}
MAX_ROUNDS=${MAX_ROUNDS:-40}
LOCK=$BASE/lex.pid

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  echo "[lex] already running as PID $(cat "$LOCK") - exiting"; exit 0
fi
mkdir -p "$BASE/texts/node0" "$BASE/texts/prod_snapshot"
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log() { echo "[lex $(date -u +%H:%M:%S)] $*"; }

# Ship this node's results into prod's texts tree as node_lex, then stamp the heartbeat. The
# heartbeat goes LAST so prod never sees a fresh heartbeat with results still in flight.
push() {
  rsync -az --partial "$BASE/texts/node0/" "$REMOTE:$RBASE/texts/node_lex/" \
    --exclude worker.pid --exclude heartbeat 2>/dev/null \
    && ssh "$REMOTE" "touch $RBASE/texts/node_lex/heartbeat" 2>/dev/null
}

# Keep the heartbeat alive and results flowing while the fetcher works.
pusher() {
  while :; do
    sleep "$PUSH_EVERY"
    push && log "pushed $(wc -l < "$BASE/texts/node0/done.txt" 2>/dev/null || echo 0) resolved rows"
  done
}

ssh "$REMOTE" "mkdir -p $RBASE/texts/node_lex" || { log "cannot reach $REMOTE"; exit 1; }
push                                   # claim the partitions before prod's next round
pusher & PUSHER=$!
trap 'rm -f "$LOCK"; kill $PUSHER 2>/dev/null' EXIT

for round in $(seq 1 "$MAX_ROUNDS"); do
  scp -q "$REMOTE:$RSCRIPTS/03_fetch_texts.py" "$SCRIPT" || { log "script pull failed"; break; }
  scp -q "$REMOTE:$RBASE/pending/pending.tsv" "$BASE/pending.tsv" || { log "pending pull failed"; break; }
  # prod's done-set, dropped where the fetcher's own global-done glob will find it
  ssh "$REMOTE" "cat $RBASE/texts/node*/done.txt 2>/dev/null" \
    > "$BASE/texts/prod_snapshot/done.txt" || true

  python3 - "$BASE/pending.tsv" "$BASE/bucket.tsv" "$LEX_SHARE" "$BASE/texts" <<'PY'
import sys, glob, os, hashlib
src, out, share, texts = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
done = set()
for p in glob.glob(os.path.join(texts, "*", "done.txt")):
    with open(p, encoding="utf-8") as f:
        done.update(l.rstrip("\n") for l in f if l.strip())


def part(row):
    """MUST match run_fetch_multiip.sh exactly, or the two sides overlap or leave a gap."""
    return int(hashlib.md5(row.encode("utf-8")).hexdigest(), 16) % 100


n = 0
with open(out, "w", encoding="utf-8") as w:
    for line in open(src, encoding="utf-8"):
        line = line.rstrip("\n")
        if line and line not in done and part(line) < share:
            w.write(line + "\n"); n += 1
print(f"claimed {n} rows in partitions 0-{share - 1}", flush=True)
PY

  remaining=$(wc -l < "$BASE/bucket.tsv")
  log "round $round: $remaining rows to fetch"
  [ "$remaining" -eq 0 ] && { log "slice drained"; break; }

  SOURCE=zakon PENDING=$BASE/bucket.tsv OUTDIR=$BASE/texts/node0 \
    RATE=$RATE WORKERS=$WORKERS python3 -u "$SCRIPT"
  push
  log "round $round done"
done

push
log "FINISHED: $(wc -l < "$BASE/texts/node0/done.txt" 2>/dev/null || echo 0) rows resolved here"
