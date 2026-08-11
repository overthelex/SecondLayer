#!/bin/bash
# Three trials of the strengthened land-lease task.
#
# The design change under test: ordinary defects measured 104/106 and stopped discriminating, so
# this task now carries three omissions (0/24 measured), two traps of the shape that actually
# catches, one defect that is lawful under the obvious article and broken by another, and one
# pair of clauses that contradict each other while each is lawful alone. Three trials because a
# single pass on this pack moves by a couple of criteria either way.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6
T=real-estate/ua-dogovir-orendy-zemli-review
OUT=~/harness-lab/land4.log
: > "$OUT"
for TRIAL in 1 2 3; do
  RID="land4-t$TRIAL"
  uv run --with "anthropic[bedrock]" python -m harness.run \
      --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
      --max-turns 40 --run-id "$RID" > "/tmp/${RID}.run.log" 2>&1
  LINE=$(uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
      --run-id "$RID" --task "$T" --judge-model eu.anthropic.claude-sonnet-4-6 \
      --parallel 6 2>&1 | grep -E "criteria passed" | tail -1)
  printf '%s\t%s\n' "$TRIAL" "$LINE" >> "$OUT"
  echo "trial $TRIAL $LINE"
done
echo LAND3_DONE >> "$OUT"
