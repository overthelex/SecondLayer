#!/bin/bash
# Wait until Qdrant 6343 can serve filtered searches fast, then launch the 3K pilot.
# Self-contained (nohup it): survives SSH drops. Requires 2 consecutive healthy probes
# (<2s) so we don't launch on a transient dip while the index build is still ongoing.
set -u
cd /data/sft-distill
LOG=watcher.log
THRESH=2.0
NEED=2
ok=0
echo "$(date '+%F %T') watcher started (need ${NEED} probes < ${THRESH}s)" >> "$LOG"

# already produced a finished pilot? then nothing to do
if [ -s pilot3k/sft_chatml.jsonl ]; then
  echo "$(date '+%F %T') pilot already built -> exit" >> "$LOG"; exit 0
fi

while true; do
  LAT=$(HF_HOME=/data/hf_cache python3 probe_qdrant.py 2>/dev/null)
  healthy=0
  if [ "$LAT" != "FAIL" ] && python3 -c "import sys;sys.exit(0 if float('$LAT')<$THRESH else 1)" 2>/dev/null; then
    healthy=1; ok=$((ok+1)); else ok=0
  fi
  echo "$(date '+%F %T') probe=${LAT}s healthy=${healthy} streak=${ok}/${NEED}" >> "$LOG"
  if [ "$ok" -ge "$NEED" ]; then
    echo "$(date '+%F %T') Qdrant healthy -> launching pilot" >> "$LOG"
    nohup env HF_HOME=/data/hf_cache AWS_REGION=eu-central-1 \
      python3 distill.py run-all --work /data/sft-distill/pilot3k --per-jk 1000 --workers 12 \
      > pilot3k.log 2>&1 &
    echo "$(date '+%F %T') pilot launched PID $!" >> "$LOG"
    break
  fi
  sleep 120
done
