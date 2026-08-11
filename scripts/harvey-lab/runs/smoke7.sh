#!/bin/bash
# One run of each new statute-review task, before any of them is shown to a maintainer.
#
# CONTRIBUTING asks for a smoke run, and the pilot showed why: its first run immediately
# revealed that the model calls lawful clauses breaches and misses an omitted mandatory clause.
# Seven tasks have never been executed at all; anything structurally broken shows up here.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6
OUT=~/harness-lab/smoke7.log
: > "$OUT"
for T in real-estate/ua-dogovir-orendy-zemli-review \
         data-privacy-cybersecurity/ua-polityka-personalnyh-danyh-review \
         employment-labor/ua-polozhennya-ohorona-praci-review \
         banking-finance/ua-ipotechnyi-dogovir-review \
         contracts/ua-spozhyvchyi-dogovir-review \
         contracts/ua-tenderna-dokumentaciya-review \
         real-estate/ua-orenda-derzhmayna-review; do
  RID="smoke7-$(echo "$T" | tr '/' '-')"
  uv run --with "anthropic[bedrock]" python -m harness.run \
      --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
      --max-turns 40 --run-id "$RID" > "/tmp/${RID}.run.log" 2>&1
  TURNS=$(grep -oE "Turns: +[0-9]+" "/tmp/${RID}.run.log" | grep -oE "[0-9]+" | tail -1)
  LINE=$(uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
      --run-id "$RID" --task "$T" --judge-model eu.anthropic.claude-sonnet-4-6 \
      --parallel 6 2>&1 | grep -E "criteria passed" | tail -1)
  printf '%s\tturns=%s\t%s\n' "$T" "${TURNS:-?}" "$LINE" >> "$OUT"
  echo "$T $LINE"
done
echo SMOKE7_DONE >> "$OUT"
