#!/bin/bash
# Three trials of all seven statute-review tasks after the port.
#
# Two design changes carried over from the land-lease testbed, the two that measured as
# discriminating: more omissions (0/18 there) and one pair of clauses that contradict each other
# while each is lawful alone (3/9). The three ideas that did not work — traps of a new shape, a
# defect lawful under the obvious article, and a trap built on a trailing qualifier — were not
# ported.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6
OUT=~/harness-lab/seven3.log
: > "$OUT"
TASKS="real-estate/ua-dogovir-orendy-zemli-review
data-privacy-cybersecurity/ua-polityka-personalnyh-danyh-review
employment-labor/ua-polozhennya-ohorona-praci-review
banking-finance/ua-ipotechnyi-dogovir-review
contracts/ua-spozhyvchyi-dogovir-review
contracts/ua-tenderna-dokumentaciya-review
real-estate/ua-orenda-derzhmayna-review"
for TRIAL in 1 2 3; do
  for T in $TASKS; do
    RID="seven3-t$TRIAL-$(echo "$T" | tr '/' '-')"
    uv run --with "anthropic[bedrock]" python -m harness.run \
        --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
        --max-turns 40 --run-id "$RID" > "/tmp/${RID}.run.log" 2>&1
    LINE=$(uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
        --run-id "$RID" --task "$T" --judge-model eu.anthropic.claude-sonnet-4-6 \
        --parallel 6 2>&1 | grep -E "criteria passed" | tail -1)
    printf '%s\t%s\t%s\n' "$TRIAL" "$T" "$LINE" >> "$OUT"
    echo "t$TRIAL $T $LINE"
  done
  echo "--- trial $TRIAL complete ---" >> "$OUT"
done
echo SEVEN3_DONE >> "$OUT"
