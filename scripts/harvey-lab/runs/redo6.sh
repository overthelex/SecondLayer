#!/bin/bash
# Re-run the six tasks whose repeal-date wording was corrected, three trials each.
#
# The wording change is not expected to move any score: all six matters sit in 2019-2021 and
# the operative clause was true under either date. But the reported pack figure has to describe
# the text that is actually committed, so the six are measured again rather than assumed.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6

MODEL=bedrock/eu.anthropic.claude-sonnet-4-6
OUT="$HOME/harness-lab/redo6.log"
: > "$OUT"

TASKS="
litigation-dispute-resolution/ua-limitation-contractual-shortening-void
litigation-dispute-resolution/ua-limitation-extended-by-agreement
litigation-dispute-resolution/ua-limitation-not-raised-by-party
litigation-dispute-resolution/ua-limitation-penalty-one-year
litigation-dispute-resolution/ua-limitation-period-martial-law
litigation-dispute-resolution/ua-limitation-quarantine-vs-martial-law
"

for TRIAL in 1 2 3; do
  for T in $TASKS; do
    RID="redo6-t${TRIAL}-$(echo "$T" | tr '/' '-')"
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
echo REDO6_DONE >> "$OUT"
