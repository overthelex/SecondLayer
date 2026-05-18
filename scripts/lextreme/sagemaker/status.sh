#!/bin/bash
# Show status of all experiments. Reads local state + checks SageMaker.
#
# Usage:
#   ./status.sh              # summary table
#   ./status.sh --refresh    # refresh InProgress jobs from SageMaker API
#   ./status.sh --pending    # list only pending (not yet launched) jobs

set -euo pipefail
source "$(dirname "$0")/config.sh"

REFRESH=false
PENDING_ONLY=false
for arg in "$@"; do
  case $arg in
    --refresh) REFRESH=true ;;
    --pending) PENDING_ONLY=true ;;
  esac
done

# --- Refresh InProgress jobs ---
if [ "$REFRESH" = true ]; then
  for state_file in "${STATE_DIR}"/*.json; do
    [ -f "$state_file" ] || continue
    STATUS=$(python3 -c "import json; print(json.load(open('${state_file}'))['status'])" 2>/dev/null)
    if [ "$STATUS" = "InProgress" ]; then
      JOB_NAME=$(python3 -c "import json; print(json.load(open('${state_file}'))['job_name'])" 2>/dev/null)
      NEW_STATUS=$(aws sagemaker describe-training-job \
        --region "${SM_REGION}" \
        --training-job-name "${JOB_NAME}" \
        --query TrainingJobStatus --output text 2>/dev/null || echo "Unknown")

      if [ "$NEW_STATUS" != "InProgress" ] && [ "$NEW_STATUS" != "Unknown" ]; then
        python3 -c "
import json
d = json.load(open('${state_file}'))
d['status'] = '${NEW_STATUS}'
json.dump(d, open('${state_file}', 'w'), indent=2)
"
        echo "Updated: $(basename "$state_file" .json) -> ${NEW_STATUS}"
      fi
    fi
  done
  echo ""
fi

# --- Build full job list ---
python3 << 'PYEOF'
import json, os, sys

state_dir = os.environ["STATE_DIR"]
pending_only = "--pending" in sys.argv

models = ["xlm-roberta-base", "xlm-roberta-large", "legal-xlm-roberta-base", "legal-xlm-roberta-large"]
epochs = ["pre_war", "hybrid_war", "full_scale"]
seeds = [42, 123, 456]

completed = 0
in_progress = 0
failed = 0
pending = 0

if not pending_only:
    print(f"{'Job Key':<50} {'Status':<15} {'Job Name'}")
    print("-" * 100)

for model in models:
    for epoch in epochs:
        for seed in seeds:
            key = f"{model}_{epoch}_s{seed}"
            state_file = os.path.join(state_dir, f"{key}.json")

            if os.path.exists(state_file):
                with open(state_file) as f:
                    state = json.load(f)
                status = state.get("status", "Unknown")
                job_name = state.get("job_name", "")
            else:
                status = "Pending"
                job_name = ""

            if status == "Completed":
                completed += 1
                if pending_only: continue
            elif status == "InProgress":
                in_progress += 1
                if pending_only: continue
            elif status == "Pending":
                pending += 1
            else:
                failed += 1
                if pending_only: continue

            if not pending_only:
                print(f"{key:<50} {status:<15} {job_name}")
            else:
                print(f"--model {model} --epoch {epoch} --seed {seed}")

# Continual jobs
for direction in ["forward", "backward"]:
    for model in models:
        for seed in seeds:
            key = f"continual_{direction}_{model}_s{seed}"
            state_file = os.path.join(state_dir, f"{key}.json")

            if os.path.exists(state_file):
                with open(state_file) as f:
                    state = json.load(f)
                status = state.get("status", "Unknown")
                job_name = state.get("job_name", "")
            else:
                status = "Pending"
                job_name = ""

            if status == "Completed":
                completed += 1
                if pending_only: continue
            elif status == "Pending":
                pending += 1
            else:
                if pending_only: continue

            if not pending_only:
                print(f"{key:<50} {status:<15} {job_name}")
            else:
                print(f"--model {model} --continual {direction} --seed {seed}")

print("")
print(f"Summary: {completed} completed, {in_progress} in progress, {failed} failed, {pending} pending")
total = completed + in_progress + failed + pending
if total > 0:
    print(f"Progress: {completed}/{total} ({100*completed/total:.0f}%)")
PYEOF
