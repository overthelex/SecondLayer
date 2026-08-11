#!/bin/bash
# Re-run the fourteen diligence tasks after the deliverable rename, three trials each.
#
# The rename removes an unfair failure mode, so scores should rise slightly on the tasks where
# the language criterion was failing over the file name. That is a prediction, not a licence to
# assume: the pack figure has to describe the text that is committed, so all fourteen are measured.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6

MODEL=bedrock/eu.anthropic.claude-sonnet-4-6
OUT="$HOME/harness-lab/redo14.log"
: > "$OUT"

TASKS="
diligence/ua-agro-supply-v2
diligence/ua-chemicals-permit-v2
diligence/ua-construction-capital-v2
diligence/ua-counterparty-tax-v2
diligence/ua-energy-tenders-v2
diligence/ua-equipment-authority-v2
diligence/ua-food-tax-v2
diligence/ua-it-address-v2
diligence/ua-logistics-nominee-v2
diligence/ua-media-ownership-v2
diligence/ua-metals-seizure-v2
diligence/ua-pharma-sanctions-v2
diligence/ua-retail-successor-v2
diligence/ua-transport-fleet-v2
"

for TRIAL in 1 2 3; do
  for T in $TASKS; do
    RID="redo14-t${TRIAL}-$(echo "$T" | tr '/' '-')"
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
