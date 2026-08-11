#!/bin/bash
# Re-measure the whole pack after the criteria decomposition, three trials.
#
# Every task's rubric changed, so pack3/redo6/redo14 no longer describe the committed text
# and nothing can be carried over. Criteria went 298 -> 861, so the judge does roughly three
# times the work per run; the agent side is unchanged.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6

MODEL=bedrock/eu.anthropic.claude-sonnet-4-6
OUT="$HOME/harness-lab/pack4.log"
: > "$OUT"

TASKS=$(cd tasks && ls -d */ua-* | sort)

for TRIAL in 1 2 3; do
  for T in $TASKS; do
    RID="pack4-t${TRIAL}-$(echo "$T" | tr '/' '-')"
    uv run --with "anthropic[bedrock]" python -m harness.run \
        --model "$MODEL" --task "$T" --max-turns 40 --run-id "$RID" \
        > "/tmp/${RID}.run.log" 2>&1
    LINE=$(uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
        --run-id "$RID" --task "$T" \
        --judge-model eu.anthropic.claude-sonnet-4-6 --parallel 6 2>&1 \
      | grep -E "criteria passed" | tail -1)
    printf '%s\t%s\t%s\n' "$TRIAL" "$T" "$LINE" >> "$OUT"
    echo "$TRIAL $T $LINE"
  done
  echo "--- trial $TRIAL complete ---" >> "$OUT"
done
echo PACK4_DONE >> "$OUT"
