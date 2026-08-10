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

# Count DISTINCT pairs. The same row legitimately lands in two node dirs (a re-split moves it,
# or the external node and a prod node both resolve it), so a plain `wc -l` over-counts. That
# matters because the stop condition is `remaining <= 0`: with phantom rows the supervisor
# declares the pending set drained while real rows are still unfetched, writes the completion
# flag, and those rows are never retried. Measured 539 duplicates against 404518 real ones.
done_count() { cat "$BASE"/texts/*/done.txt 2>/dev/null | sort -u | wc -l; }

rm -f "$FLAG"
prev_done=$(done_count)
stagnant=0
idle_rounds=0
MAX_IDLE_ROUNDS=${MAX_IDLE_ROUNDS:-30}
# Why the harvest ended decides whether a completion flag is honest. Only a drained pending set
# or genuine stagnation means "finished"; everything else is a stop, and a stop that publishes
# a completion flag is worse than no flag at all.
outcome=incomplete

for round in $(seq 1 "$MAX_ROUNDS"); do
  now_done=$(done_count)
  remaining=$(( $(wc -l < "$PENDING") - now_done ))
  gained=$(( now_done - prev_done ))
  log "round $round: done=$now_done remaining=$remaining gained_last_round=$gained"

  if [ "$remaining" -le 0 ]; then
    outcome=drained; log "pending set drained"; break
  fi
  if [ "$round" -gt 1 ] && [ "$gained" -le 0 ]; then
    stagnant=$(( stagnant + 1 ))
    if [ "$stagnant" -ge 2 ]; then
      outcome=stagnant
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
    # An all-zero-bucket round is NORMAL while the external node holds a reservation: prod has
    # nothing of its own left, but the corpus is not finished. Treating that as an abort is how
    # this wrote a completion flag with ~1700 rows still unfetched. Wait and re-check instead;
    # a genuine finish is caught by the `remaining <= 0` test at the top of the loop.
    idle_rounds=$((idle_rounds + 1))
    if [ "$idle_rounds" -ge "$MAX_IDLE_ROUNDS" ]; then
      outcome=no_workers
      log "no workers came up for $idle_rounds rounds with $remaining rows left - giving up"
      break
    fi
    log "no local work this round ($remaining rows left, likely reserved) - waiting"
    sleep "$POLL"
    continue
  fi
  idle_rounds=0

  # wait for the fleet to drain its buckets
  while [ "$(running)" -gt 0 ]; do
    sleep "$POLL"
  done
  log "fleet idle after round $round"
done

final_done=$(done_count)
final_remaining=$(( $(wc -l < "$PENDING") - final_done ))

# Publish a completion flag ONLY for an honest finish. Anything else is a stop, and a stop that
# publishes "complete" is worse than publishing nothing: downstream reads the flag and starts
# chunking a corpus with holes in it.
case "$outcome" in
  drained|stagnant) ;;
  *)
    log "STOPPED without completing (outcome=$outcome, $final_remaining rows left) - no flag written"
    exit 1
    ;;
esac

# land the flag FIRST — the 200-count is a ~10 min scan of 10 GB of shards, and if the
# supervisor is killed during it the completion signal would never appear at all
{
  echo "completed_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "outcome=$outcome"
  echo "editions_total=$(wc -l < "$PENDING")"
  echo "resolved=$final_done"
  echo "unresolved=$final_remaining"
} > "$FLAG"
log "STAGE 2 COMPLETE ($outcome): resolved=$final_done unresolved=$final_remaining -> $FLAG (counting texts...)"
ok=$(grep -ho '"http_status": 200' "$BASE"/texts/*/shard_*.ndjson 2>/dev/null | wc -l)
echo "texts_200=$ok" >> "$FLAG"
log "texts_200=$ok"
