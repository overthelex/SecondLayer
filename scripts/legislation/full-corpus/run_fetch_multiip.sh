#!/usr/bin/env bash
# Launch N Stage-2 fetchers on prod, one per secondary IP/EIP, in a tmux session.
# Each fetcher: RATE req/s on its own EIP, own bucket of the pending list, own OUTDIR.
#
# Re-splitting is SAFE and is how the fleet rebalances: 03_fetch_texts.py loads a GLOBAL
# done-set (every texts/*/done.txt), so a row that moved to another node is skipped, never
# refetched. supervise.sh relies on that — each round re-splits whatever is still pending.
set -euo pipefail

BASE=/data/rada_npa
PENDING=$BASE/pending/pending.tsv
SCRIPTS=${SCRIPTS:-$HOME/rada_npa/scripts}
# Rates are set by measurement, not by what the sources will accept without erroring.
# data.rada is a weak origin and saturates GLOBALLY, not per IP: 4 nodes x 1.0/s pushed its
# latency from 2.4s to 11-14s, past the read timeout, and ~73% of requests became transient
# failures. At 0.5/s per node an arm persisted 0.37/s with 86% 200s and 2 transients.
# zakon meanwhile measured 0.15/s persisted with 41 transients and ZERO 200s at 1.0/s, so it
# is kept as a low-rate side channel (it still resolves 404s, and it answers OpenData's 403s).
# Stepping 0.5 -> 0.7 held: 0.63-0.69/s persisted per node, transients still ~0. Step further
# only by measuring retry_later in the node logs, and drop straight back if it starts climbing.
RATE=${RATE:-0.7}            # per-IP req/s for OpenData nodes
ZRATE=${ZRATE:-0.4}          # per-IP req/s for zakon nodes
WORKERS=${WORKERS:-4}
# secondary private IPs on ens5, each mapped to a distinct EIP (verified reachable).
# NOTE: 12 IPs / ~96 concurrent conns tripped a Rada /20 prefix-level block (all IPs → 000).
# 6 IPs @ 8 workers (~48 conns) runs sustainably. Do NOT exceed ~6 here.
IPS=(172.31.28.109 172.31.27.31 172.31.31.40 172.31.21.47 172.31.29.20 172.31.22.206)
# Per-node source. The last two IPs earned a multi-hour OpenData 403 ban in 2026-07 and were
# still banned on 2026-08-10, so they stay on zakon; re-probe before flipping them back.
SRCS=(opendata opendata opendata opendata zakon zakon)
# Relative share of the pending list. OpenData is ~10x zakon, so it gets ~10x the rows;
# any residual imbalance is corrected by the next supervise.sh round.
WEIGHTS=(10 10 10 10 1 1)
N=${#IPS[@]}

mkdir -p "$BASE/pending"
# split into N weighted buckets, skipping anything already in a done.txt (so a round's
# buckets hold only real work and the weights mean what they say).
python3 - "$PENDING" "$BASE/pending" "$BASE/texts" "${WEIGHTS[@]}" <<'PY'
import sys, glob, os, itertools, random
src, out, texts = sys.argv[1], sys.argv[2], sys.argv[3]
weights = [int(x) for x in sys.argv[4:]]
n = len(weights)

done = set()
for p in glob.glob(os.path.join(texts, "*", "done.txt")):
    with open(p, encoding="utf-8") as f:
        done.update(l.rstrip("\n") for l in f if l.strip())

rows = [l.rstrip("\n") for l in open(src, encoding="utf-8")]
rows = [r for r in rows if r and r not in done]
# pending.tsv is sorted by ed_date, so its early stretch is almost entirely pre-1991 rows that
# 403/404 everywhere. Left in order, one node would eat the whole dead zone (wrecking both the
# ETA and the ban guard's read of the traffic). Fixed seed: reproducible, and re-splitting is
# harmless anyway because the done-set is global.
random.Random(20260810).shuffle(rows)

fs = [open(f"{out}/bucket_{i}.tsv", "w", encoding="utf-8") for i in range(n)]
c = [0] * n
# deal round-robin over a weight-expanded slot ring, so shares follow the weights exactly
ring = list(itertools.chain.from_iterable([i] * w for i, w in enumerate(weights)))
for k, line in enumerate(rows):
    b = ring[k % len(ring)]
    fs[b].write(line + "\n"); c[b] += 1
for f in fs:
    f.close()
print(f"done={len(done)} pending={sum(c)} bucket sizes: {c}", flush=True)
PY

# setsid nohup, not tmux: the supervisor itself runs detached with no controlling terminal,
# and from there `tmux new-session` dies with "server exited unexpectedly". Each node already
# has its own fetch.log, so a tmux server bought nothing but a dependency.
for i in $(seq 0 $((N-1))); do
  ip=${IPS[$i]}
  source=${SRCS[$i]}
  outdir=$BASE/texts/node$i
  rate=$RATE
  [ "$source" = "zakon" ] && rate=$ZRATE
  mkdir -p "$outdir"
  rm -f "$outdir/worker.pid"       # stale PID from a killed run would read as "still running"
  setsid nohup env SRC_IP="$ip" SOURCE="$source" PENDING="$BASE/pending/bucket_$i.tsv" \
    OUTDIR="$outdir" RATE="$rate" WORKERS="$WORKERS" \
    python3 -u "$SCRIPTS/03_fetch_texts.py" </dev/null >>"$outdir/fetch.log" 2>&1 &
done
sleep 8
up=0
for f in "$BASE"/texts/node*/worker.pid; do
  [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && up=$((up + 1))
done
echo "launched $N fetchers (RATE=$RATE ZRATE=$ZRATE WORKERS=$WORKERS), $up up"
echo "progress: tail -f $BASE/texts/node*/fetch.log"
