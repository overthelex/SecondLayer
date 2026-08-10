#!/usr/bin/env bash
# Prod-side supervisor for the Stage-2 fetch fleet.
#
# The fetchers exit when their bucket is drained, but a bucket drains with rows still PENDING:
# transient failures (timeout/429/5xx) are deliberately not persisted, so they need another
# pass. And nodes finish at wildly different times (OpenData vs zakon). So: whenever the
# fleet is idle, re-split whatever is still pending and relaunch. Each round is cheap — the
# global done-set means nothing is ever refetched.
#
# Stops when the pending set is empty, when two consecutive rounds fetch nothing new
# (everything left is permanently unreachable), or at MAX_ROUNDS. Writes a completion flag
# so progress can be checked without a held SSH session.
#
# Run detached:  setsid nohup ./supervise.sh </dev/null >>/data/rada_npa/supervise.log 2>&1 &
set -uo pipefail

BASE=/data/rada_npa
SCRIPTS=${SCRIPTS:-$HOME/rada_npa/scripts}
PENDING=$BASE/pending/pending.tsv
FLAG=$BASE/STAGE2_COMPLETE.flag
LOCK=$BASE/supervise.pid
MAX_ROUNDS=${MAX_ROUNDS:-40}
POLL=${POLL:-120}

# --- single-instance lock. Two supervisors racing = two fleets on the same dirs ----------
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  echo "[sup] supervisor already running as PID $(cat "$LOCK") - exiting"; exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log() { echo "[sup $(date -u +%H:%M:%S)] $*"; }

# Count live workers from the PID files they write, NOT from a ps/pgrep pattern: every ps-based
# variant also matched the ssh and bash command lines that merely CONTAIN the script name, and
# a miscount here is expensive in both directions (a false 0 relaunches a second fleet on top of
# the first, a false >0 wedges the supervisor forever).
running() {
  local n=0 pid
  for f in "$BASE"/texts/node*/worker.pid; do
    [ -f "$f" ] || continue
    pid=$(cat "$f" 2>/dev/null) || continue
    case "$pid" in ''|*[!0-9]*) continue ;; esac
    kill -0 "$pid" 2>/dev/null && n=$((n + 1))
  done
  echo "$n"
}

done_count() { cat "$BASE"/texts/*/done.txt 2>/dev/null | wc -l; }

rm -f "$FLAG"
prev_done=$(done_count)
stagnant=0

for round in $(seq 1 "$MAX_ROUNDS"); do
  now_done=$(done_count)
  remaining=$(( $(wc -l < "$PENDING") - now_done ))
  gained=$(( now_done - prev_done ))
  log "round $round: done=$now_done remaining=$remaining gained_last_round=$gained"

  if [ "$remaining" -le 0 ]; then
    log "pending set drained"; break
  fi
  if [ "$round" -gt 1 ] && [ "$gained" -le 0 ]; then
    stagnant=$(( stagnant + 1 ))
    if [ "$stagnant" -ge 2 ]; then
      log "two consecutive rounds fetched nothing new - the $remaining rows left look permanently unreachable"
      break
    fi
  else
    stagnant=0
  fi
  prev_done=$now_done

  log "launching fleet"
  ( cd "$SCRIPTS" && SCRIPTS="$SCRIPTS" ./run_fetch_multiip.sh ) || log "launcher returned $?"

  # wait for workers to actually appear before watching for them to leave — tmux send-keys is
  # asynchronous and each worker first loads a ~200k-row done-set, so an immediate poll reads
  # zero and would relaunch the fleet on top of itself
  for _ in $(seq 1 12); do
    [ "$(running)" -gt 0 ] && break
    sleep 10
  done
  if [ "$(running)" -eq 0 ]; then
    log "no workers came up within 120s - aborting"; break
  fi

  # wait for the fleet to drain its buckets
  while [ "$(running)" -gt 0 ]; do
    sleep "$POLL"
  done
  log "fleet idle after round $round"
done

final_done=$(done_count)
# land the flag FIRST — the 200-count is a ~10 min scan of 10 GB of shards, and if the
# supervisor is killed during it the completion signal would never appear at all
{
  echo "completed_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "editions_total=$(wc -l < "$PENDING")"
  echo "resolved=$final_done"
} > "$FLAG"
log "STAGE 2 COMPLETE: resolved=$final_done -> $FLAG (counting texts...)"
ok=$(grep -ho '"http_status": 200' "$BASE"/texts/*/shard_*.ndjson 2>/dev/null | wc -l)
echo "texts_200=$ok" >> "$FLAG"
log "texts_200=$ok"
