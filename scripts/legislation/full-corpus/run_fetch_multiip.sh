#!/usr/bin/env bash
# Launch N Stage-2 fetchers on prod, one per secondary IP/EIP, each detached via setsid.
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
RATE=${RATE:-0.7}            # per-IP req/s for OpenData nodes (global origin ceiling)
ZRATE=${ZRATE:-3.0}          # per-IP req/s for zakon nodes. 3.90/s is reachable on a fresh EIP,
                             # but sustained for hours it earns a block, so the default backs off.
WORKERS=${WORKERS:-4}
ZWORKERS=${ZWORKERS:-6}      # zakon challenges above ~10 concurrent per IP - stay under
# secondary private IPs on ens5, each mapped to a distinct EIP (verified reachable).
# NOTE: 12 IPs / ~96 concurrent conns tripped a Rada /20 prefix-level block (all IPs → 000).
# 6 IPs @ 8 workers (~48 conns) runs sustainably. Do NOT exceed ~6 here.
# The two sources scale in opposite ways, which decides how IPs are assigned:
#   data.rada saturates GLOBALLY (4 nodes x 1.0/s took it from 2.4s to 11-14s), so adding IPs
#     there buys nothing. Cap it at the few IPs that are still allowed on it.
#   zakon.rada throttles PER IP (~4-5/s each: one IP driven at ~10/s took transients from 0 to
#     496, and stopped accumulating the moment the extra load went away), so it scales with IPs.
# Hence: a small fixed OpenData pool, and every other IP put on zakon.
OD_POOL=(172.31.28.109 172.31.27.31 172.31.31.40 172.31.21.47)
# EIPs allocated in 2026-07 and never used. Measured 2026-08-10: 3.90 req/s on zakon with ZERO
# transients, which settles the question of whether zakon penalises AWS as a class - it does
# not. Our 172.31.29.20 and 172.31.22.206 are simply burned from being hammered in July (403 on
# OpenData a month later, 0.045 req/s on zakon), so they are left out entirely: they contribute
# almost nothing and still count against the prefix-block budget.
ZK_POOL=(172.31.19.142 172.31.19.20 172.31.17.145 172.31.16.240 172.31.21.126)
# 2026-07: 12 IPs x 8 workers (~96 conns from our /20) got the WHOLE prefix blocked and the
# harvest died. Keep total concurrency well under that: 4x4 + 5x6 = 46.
CANARY_URL="https://data.rada.gov.ua/laws/show/183-2006-%D1%80/ed20060405"

# Weights are proportional to measured req/s, because a round ends only when the SLOWEST node
# drains: 0.67/s OpenData vs 3.9/s zakon -> 7 : 39.
IPS=(); SRCS=(); WEIGHTS=()
for ip in "${OD_POOL[@]}"; do
  # OpenData bans are per IP and expire on their own schedule, so eligibility is probed rather
  # than assumed; an IP that has lost OpenData still earns its keep on zakon.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 --interface "$ip" \
           -H 'User-Agent: OpenData' "$CANARY_URL" 2>/dev/null || echo 000)
  IPS+=("$ip")
  if [ "$code" = "200" ]; then
    SRCS+=(opendata); WEIGHTS+=(7)
  else
    SRCS+=(zakon); WEIGHTS+=(39)
  fi
  echo "  probe $ip canary=$code source=${SRCS[$((${#SRCS[@]}-1))]}"
done
for ip in "${ZK_POOL[@]}"; do
  IPS+=("$ip"); SRCS+=(zakon); WEIGHTS+=(39)
  echo "  $ip -> zakon (fresh EIP)"
done
N=${#IPS[@]}

# An external Ukrainian-IP node (local.lex) can take a reserved slice of the work. It reaches
# zakon.rada at 4.24 req/s with zero transients, where our AWS IPs manage 0.045 req/s, and it
# hits a DIFFERENT origin than data.rada, so its capacity is purely additive.
#
# The slice is reserved by hash partition rather than coordinated at runtime: both sides
# compute part(row) = md5(row) % 100 and take disjoint ranges, so neither can fetch the other's
# rows and no lock is needed. The reservation is only honoured while that node's heartbeat is
# fresh — if it dies or is switched off, prod reclaims the whole list on its next round instead
# of leaving 60% of the corpus stranded.
# Percent of partitions reserved for the external node. Instantaneous throughput says ~15 once
# prod's fresh zakon EIPs are running (prod ~22/s against 4.2/s there), but that ratio does not
# hold: prod's IPs degrade over a long harvest and were 403ing on both sources after eight
# hours, while the Ukrainian node held its rate with no penalty at all. Start the external share
# high rather than raise it after prod is already throttled.
# Keep in step with run_lex_node.sh: a mismatch either double-fetches a range or strands one.
LEX_SHARE=${LEX_SHARE:-60}
LEX_HEARTBEAT=$BASE/texts/node_lex/heartbeat
LEX_STALE_S=${LEX_STALE_S:-1800}
RESERVE=0
if [ -f "$LEX_HEARTBEAT" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LEX_HEARTBEAT") ))
  if [ "$age" -lt "$LEX_STALE_S" ]; then
    RESERVE=$LEX_SHARE
    echo "  external node alive (heartbeat ${age}s old) -> reserving ${RESERVE}% of partitions"
  else
    echo "  external node heartbeat is ${age}s old (stale) -> reclaiming its partitions"
  fi
fi

mkdir -p "$BASE/pending"
# split into N weighted buckets, skipping anything already in a done.txt (so a round's
# buckets hold only real work and the weights mean what they say).
python3 - "$PENDING" "$BASE/pending" "$BASE/texts" "$RESERVE" "${WEIGHTS[@]}" <<'PY'
import sys, glob, os, itertools, random, hashlib
src, out, texts = sys.argv[1], sys.argv[2], sys.argv[3]
reserve = int(sys.argv[4])
weights = [int(x) for x in sys.argv[5:]]
n = len(weights)

done = set()
for p in glob.glob(os.path.join(texts, "*", "done.txt")):
    with open(p, encoding="utf-8") as f:
        done.update(l.rstrip("\n") for l in f if l.strip())


def part(row):
    """Partition of a row, 0-99. MUST match run_lex_node.sh exactly — the two sides stay
    disjoint by both computing this and taking opposite ranges."""
    return int(hashlib.md5(row.encode("utf-8")).hexdigest(), 16) % 100


rows = [l.rstrip("\n") for l in open(src, encoding="utf-8")]
rows = [r for r in rows if r and r not in done]
if reserve:
    before = len(rows)
    rows = [r for r in rows if part(r) >= reserve]
    print(f"reserved {before - len(rows)} rows (partitions 0-{reserve - 1}) for the external node")
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
  rate=$RATE; nworkers=$WORKERS
  [ "$source" = "zakon" ] && { rate=$ZRATE; nworkers=$ZWORKERS; }
  mkdir -p "$outdir"
  rm -f "$outdir/worker.pid"       # stale PID from a killed run would read as "still running"
  setsid nohup env SRC_IP="$ip" SOURCE="$source" PENDING="$BASE/pending/bucket_$i.tsv" \
    OUTDIR="$outdir" RATE="$rate" WORKERS="$nworkers" \
    python3 -u "$SCRIPTS/03_fetch_texts.py" </dev/null >>"$outdir/fetch.log" 2>&1 &
done
sleep 8
up=0
for f in "$BASE"/texts/node*/worker.pid; do
  [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && up=$((up + 1))
done
echo "launched $N fetchers (RATE=$RATE ZRATE=$ZRATE WORKERS=$WORKERS), $up up"
echo "progress: tail -f $BASE/texts/node*/fetch.log"
