#!/bin/bash
# Judge every pilot run and collect scores.
#   bash run_judge.sh vanilla   (before the landing gate)
#   bash run_judge.sh landed    (after it)
set -u
LABEL="${1:?need a label}"
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6

OUT="$HOME/harness-lab/judge-$LABEL.tsv"
: > "$OUT"

python3 ~/harness-lab/judge_pilot.py > /tmp/pilot_runs.tsv

while IFS=$'\t' read -r TASK RID; do
  echo "### $TASK"
  uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
      --run-id "$RID" --task "$TASK" \
      --judge-model eu.anthropic.claude-sonnet-4-6 --parallel 6 2>&1 \
    | grep -E "criteria passed|Score:" || true
  python3 ~/harness-lab/collect_score.py "$RID" "$TASK" "$OUT"
done < /tmp/pilot_runs.tsv

echo "=== $LABEL SUMMARY ==="
awk -F'\t' '$2!="NO_SCORES"{p+=$2; t+=$3; a+=$4; n++}
  END{printf "tasks=%d pooled=%d/%d=%.1f%% all_pass=%d/%d=%.1f%%\n",
      n, p, t, (t?100*p/t:0), a, n, (n?100*a/n:0)}' "$OUT"
echo "JUDGE_${LABEL}_DONE"
