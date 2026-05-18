#!/bin/bash
# Run all pending experiments sequentially (quota = 1 g5.12xlarge).
# Skips completed jobs. Safe to Ctrl+C and restart.
#
# Usage:
#   ./run_all.sh                    # all 36 training jobs
#   ./run_all.sh --continual        # include continual learning
#   ./run_all.sh --dry-run          # show what would run
#   ./run_all.sh --model xlm-roberta-base   # only this model

set -euo pipefail
source "$(dirname "$0")/config.sh"

INCLUDE_CONTINUAL=false
DRY_RUN=false
FILTER_MODEL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --continual) INCLUDE_CONTINUAL=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    --model)     FILTER_MODEL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

LAUNCH="$(dirname "$0")/launch_job.sh"

# --- Training jobs ---
TOTAL=0
SKIPPED=0
LAUNCHED=0

for model in "${MODELS[@]}"; do
  [ -n "$FILTER_MODEL" ] && [ "$model" != "$FILTER_MODEL" ] && continue

  for epoch in "${EPOCHS[@]}"; do
    for seed in "${SEEDS[@]}"; do
      TOTAL=$((TOTAL + 1))
      JOB_KEY="${model}_${epoch}_s${seed}"
      STATE_FILE="${STATE_DIR}/${JOB_KEY}.json"

      if [ -f "${STATE_FILE}" ]; then
        STATUS=$(python3 -c "import json; print(json.load(open('${STATE_FILE}'))['status'])" 2>/dev/null || echo "unknown")
        if [ "$STATUS" = "Completed" ]; then
          SKIPPED=$((SKIPPED + 1))
          continue
        fi
      fi

      LAUNCHED=$((LAUNCHED + 1))
      echo ""
      echo "[${LAUNCHED}] ${model} / ${epoch} / seed=${seed}"

      if [ "$DRY_RUN" = true ]; then
        echo "  [DRY-RUN] Would launch"
      else
        bash "${LAUNCH}" --model "${model}" --epoch "${epoch}" --seed "${seed}" --wait
      fi
    done
  done
done

# --- Continual learning ---
if [ "$INCLUDE_CONTINUAL" = true ]; then
  for model in "${MODELS[@]}"; do
    [ -n "$FILTER_MODEL" ] && [ "$model" != "$FILTER_MODEL" ] && continue

    for seed in "${SEEDS[@]}"; do
      for direction in forward backward; do
        TOTAL=$((TOTAL + 1))
        JOB_KEY="continual_${direction}_${model}_s${seed}"
        STATE_FILE="${STATE_DIR}/${JOB_KEY}.json"

        if [ -f "${STATE_FILE}" ]; then
          STATUS=$(python3 -c "import json; print(json.load(open('${STATE_FILE}'))['status'])" 2>/dev/null || echo "unknown")
          if [ "$STATUS" = "Completed" ]; then
            SKIPPED=$((SKIPPED + 1))
            continue
          fi
        fi

        LAUNCHED=$((LAUNCHED + 1))
        echo ""
        echo "[${LAUNCHED}] continual ${direction} / ${model} / seed=${seed}"

        if [ "$DRY_RUN" = true ]; then
          echo "  [DRY-RUN] Would launch"
        else
          bash "${LAUNCH}" --model "${model}" --continual "${direction}" --seed "${seed}" --wait
        fi
      done
    done
  done
fi

echo ""
echo "================================================================"
echo "  ${LAUNCHED} launched, ${SKIPPED} skipped (completed), ${TOTAL} total"
echo "================================================================"
