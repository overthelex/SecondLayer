#!/usr/bin/env bash
# Re-harvest the 60 876 editions whose registry number contains a slash.
#
# They were all recorded as 404 because the fetcher percent-encoded the slash, which Rada reads
# as a path separator. Nothing about them is actually missing from the source.
#
# Runs against its own tree (/data/rada_npa/fix) on purpose: 03_fetch_texts.py builds its
# done-set from sibling directories of OUTDIR, and in the main tree these pairs are already
# recorded as resolved-404, so every one of them would be skipped.
set -euo pipefail

BASE=/data/rada_npa/fix
SCRIPTS=$HOME/rada_npa/scripts
RATE=${RATE:-0.7}
ZRATE=${ZRATE:-3.0}
WORKERS=${WORKERS:-4}
ZWORKERS=${ZWORKERS:-6}

OD_POOL=(172.31.28.109 172.31.27.31 172.31.31.40 172.31.21.47)
ZK_POOL=(172.31.19.142 172.31.19.20 172.31.17.145 172.31.16.240 172.31.21.126)
CANARY="https://data.rada.gov.ua/laws/show/183-2006-%D1%80/ed20060405"

IPS=(); SRCS=(); WEIGHTS=()
for ip in "${OD_POOL[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 --interface "$ip" \
           -H 'User-Agent: OpenData' "$CANARY" 2>/dev/null || echo 000)
  IPS+=("$ip")
  if [ "$code" = "200" ]; then SRCS+=(opendata); WEIGHTS+=(7); else SRCS+=(zakon); WEIGHTS+=(39); fi
  echo "  probe $ip canary=$code -> ${SRCS[$((${#SRCS[@]}-1))]}"
done
for ip in "${ZK_POOL[@]}"; do IPS+=("$ip"); SRCS+=(zakon); WEIGHTS+=(39); done
N=${#IPS[@]}

mkdir -p "$BASE/buckets"
python3 - "$BASE/pending.tsv" "$BASE/buckets" "$BASE" "${WEIGHTS[@]}" <<'PY'
import sys, glob, os, itertools, random
src, out, base = sys.argv[1], sys.argv[2], sys.argv[3]
weights = [int(x) for x in sys.argv[4:]]
n = len(weights)
done = set()
for p in glob.glob(os.path.join(base, "node*", "done.txt")):
    with open(p, encoding="utf-8") as f:
        done.update(l.rstrip("\n") for l in f if l.strip())
rows = [l.rstrip("\n") for l in open(src, encoding="utf-8")]
rows = [r for r in rows if r and r not in done]
random.Random(20260810).shuffle(rows)
fs = [open(f"{out}/bucket_{i}.tsv", "w", encoding="utf-8") for i in range(n)]
c = [0]*n
ring = list(itertools.chain.from_iterable([i]*w for i, w in enumerate(weights)))
for k, line in enumerate(rows):
    b = ring[k % len(ring)]
    fs[b].write(line + "\n"); c[b] += 1
for f in fs: f.close()
print(f"done={len(done)} pending={sum(c)} buckets={c}", flush=True)
PY

for i in $(seq 0 $((N-1))); do
  ip=${IPS[$i]}; source=${SRCS[$i]}; outdir=$BASE/node$i
  rate=$RATE; nw=$WORKERS
  [ "$source" = "zakon" ] && { rate=$ZRATE; nw=$ZWORKERS; }
  mkdir -p "$outdir"; rm -f "$outdir/worker.pid"
  setsid nohup env SRC_IP="$ip" SOURCE="$source" PENDING="$BASE/buckets/bucket_$i.tsv" \
    OUTDIR="$outdir" RATE="$rate" WORKERS="$nw" \
    python3 -u "$SCRIPTS/03_fetch_texts.py" </dev/null >>"$outdir/fetch.log" 2>&1 &
done
sleep 8
up=0
for f in "$BASE"/node*/worker.pid; do [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && up=$((up+1)); done
echo "launched $N fetchers, $up up"
