#!/bin/bash
# Phase 2 driver: wait for index walks, then fan out full-text fetches.
# Politeness is enforced by Lambda reserved concurrency, not by this loop.
set -u
SD="${UAE_WORK_DIR:-$(cd "$(dirname "$0")" && pwd)/work}"
mkdir -p "$SD"
B="${UAE_BUCKET:?set UAE_BUCKET}"
AWS="aws --profile ${UAE_PROFILE:-uae} --region ${UAE_REGION:-me-central-1}"
LOG=$SD/texts_pipeline.log
CONC=10
BATCH=50
: > "$LOG"
say() { echo "$(date -u +%H:%M:%SZ) $*" >> "$LOG"; }

say "waiting for index chains to finish"
for i in $(seq 1 200); do
    if grep -q "ALL. index chains finished" "$SD/index_chain.log" 2>/dev/null; then say "chains done"; break; fi
    N=$($AWS s3 ls "s3://$B/index/" 2>/dev/null | grep -cE "stage[0-9]+_c[0-9]+")
    say "index chunks so far: $N"
    sleep 60
done

mkdir -p "$SD/idx" && $AWS s3 cp "s3://$B/index/" "$SD/idx/" --recursive --exclude "*" --include "stage*_c*.json.gz" >/dev/null 2>&1
say "downloaded: $(ls "$SD/idx" | tr '\n' ' ')"

python3 - "$SD" "$BATCH" >> "$LOG" 2>&1 <<'PY'
import glob, gzip, json, os, sys
sd, batch = sys.argv[1], int(sys.argv[2])
seen, items, skipped = set(), [], 0
for f in sorted(glob.glob(os.path.join(sd, "idx", "stage*_c*.json.gz"))):
    rows = json.loads(gzip.open(f).read())
    for r in rows:
        # cassation (5) and appeal (3) only - first instance is out of scope
        if str(r.get("stage")) not in ("5", "3"):
            skipped += 1
            continue
        k = (r["subtype"], r["serial"], r["case_year"], r["decision_no"], r["stage"])
        if k in seen:
            continue
        seen.add(k)
        items.append({key: r[key] for key in
                      ("subtype", "serial", "case_year", "decision_no", "stage")})
    print("  %s -> %d rows (unique so far %d)" % (os.path.basename(f), len(rows), len(items)))
os.makedirs(os.path.join(sd, "payloads"), exist_ok=True)
n = 0
for i in range(0, len(items), batch):
    n += 1
    with open(os.path.join(sd, "payloads", "b%05d.json" % n), "w") as fh:
        json.dump({"mode": "texts", "timeout": 40, "delay": 0.25,
                   "s3_key": "texts/b%05d.json.gz" % n,
                   "items": items[i:i + batch]}, fh, ensure_ascii=False)
print("TOTAL %d docs in %d batches (skipped %d first-instance rows)" % (len(items), n, skipped))
open(os.path.join(sd, "batch_count.txt"), "w").write(str(n))
PY

TOTAL=$(cat "$SD/batch_count.txt" 2>/dev/null || echo 0)
say "prepared $TOTAL batches"
[ "$TOTAL" -eq 0 ] && { say "nothing to do"; exit 1; }

# Synchronous invokes: async events are silently dropped for this function
# (accepted with 202, never executed, zero Errors and zero AsyncEventsDropped).
# Concurrency is controlled here by xargs -P, not by reserved concurrency.
mkdir -p "$SD/resp"
say "running $TOTAL batches synchronously, $CONC at a time"
ls "$SD"/payloads/*.json | xargs -P "$CONC" -n 1 "$(dirname "$0")/fetch_batch.sh"
say "all $TOTAL batches attempted"

for i in $(seq 1 400); do
    DONE=$($AWS s3 ls "s3://$B/texts/" 2>/dev/null | wc -l | tr -d ' ')
    say "texts done: $DONE/$TOTAL"
    [ "$DONE" -ge "$TOTAL" ] && { say "ALL TEXTS FETCHED"; break; }
    sleep 60
done
$AWS lambda delete-function-concurrency --function-name uae-fetch >/dev/null 2>&1
say "pipeline finished"
