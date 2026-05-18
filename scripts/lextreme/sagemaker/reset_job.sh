#!/bin/bash
# Reset state for a job so it can be re-run.
#
# Usage:
#   ./reset_job.sh --job-key xlm-roberta-base_pre_war_s42
#   ./reset_job.sh --failed   # reset all failed jobs
#   ./reset_job.sh --all      # reset everything (careful!)

set -euo pipefail
source "$(dirname "$0")/config.sh"

JOB_KEY=""
RESET_FAILED=false
RESET_ALL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --job-key) JOB_KEY="$2"; shift 2 ;;
    --failed)  RESET_FAILED=true; shift ;;
    --all)     RESET_ALL=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

RESET_COUNT=0

if [ -n "$JOB_KEY" ]; then
  STATE_FILE="${STATE_DIR}/${JOB_KEY}.json"
  if [ -f "$STATE_FILE" ]; then
    echo "Resetting: ${JOB_KEY}"
    rm "${STATE_FILE}"
    RESET_COUNT=1
  else
    echo "No state found for: ${JOB_KEY}"
  fi
elif [ "$RESET_FAILED" = true ]; then
  for state_file in "${STATE_DIR}"/*.json; do
    [ -f "$state_file" ] || continue
    STATUS=$(python3 -c "import json; print(json.load(open('${state_file}'))['status'])" 2>/dev/null)
    if [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Stopped" ] || [ "$STATUS" = "LaunchFailed" ]; then
      KEY=$(basename "$state_file" .json)
      echo "Resetting: ${KEY} (was: ${STATUS})"
      rm "$state_file"
      RESET_COUNT=$((RESET_COUNT + 1))
    fi
  done
elif [ "$RESET_ALL" = true ]; then
  RESET_COUNT=$(ls "${STATE_DIR}"/*.json 2>/dev/null | wc -l)
  rm -f "${STATE_DIR}"/*.json
  echo "Reset all state files"
else
  echo "Usage: ./reset_job.sh --job-key <key> | --failed | --all"
  exit 1
fi

echo "Reset ${RESET_COUNT} job(s)"
