#!/bin/bash
# Four-task smoke before any full re-measurement.
#
# The last full run was launched without one and had to be killed three tasks in, after those
# three showed the decomposition had inflated the pooled rate rather than sharpened it. Two
# diligence tasks check the reverted rubric; two litigation tasks are here because the
# litigation fan-out has NOT been measured and must not be cut by analogy.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6

OUT="$HOME/harness-lab/smoke4.log"
: > "$OUT"
for T in diligence/ua-agro-supply-v2 diligence/ua-chemicals-permit-v2 \
         litigation-dispute-resolution/ua-limitation-penalty-one-year \
         litigation-dispute-resolution/ua-limitation-window-before-p19; do
  RID="smoke4-$(echo "$T" | tr '/' '-')"
  uv run --with "anthropic[bedrock]" python -m harness.run \
      --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
      --max-turns 40 --run-id "$RID" > "/tmp/${RID}.run.log" 2>&1
  LINE=$(uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
      --run-id "$RID" --task "$T" \
      --judge-model eu.anthropic.claude-sonnet-4-6 --parallel 6 2>&1 \
    | grep -E "criteria passed" | tail -1)
  printf '%s\t%s\n' "$T" "$LINE" >> "$OUT"
  echo "$T $LINE"
done
echo SMOKE4_DONE >> "$OUT"
