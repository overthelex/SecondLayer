#!/bin/bash
# Three litigation tasks after the statutory extract went in, to see what changed.
#
# The interesting ones are the temporal windows: before the extract the model had to recall which
# version of paragraph 19 applied, and window D failed 6/10 three times running. Now the text is
# in front of it and the question is whether it maps the judgment date to the right edition.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6
OUT=~/harness-lab/smoke_lit.log
: > "$OUT"
for T in litigation-dispute-resolution/ua-limitation-window-before-p19 \
         litigation-dispute-resolution/ua-limitation-window-after-repeal \
         litigation-dispute-resolution/ua-limitation-quarantine-vs-martial-law; do
  RID="lit2-$(echo "$T" | tr '/' '-')"
  uv run --with "anthropic[bedrock]" python -m harness.run \
      --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
      --max-turns 40 --run-id "$RID" > "/tmp/${RID}.run.log" 2>&1
  LINE=$(uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
      --run-id "$RID" --task "$T" --judge-model eu.anthropic.claude-sonnet-4-6 \
      --parallel 6 2>&1 | grep -E "criteria passed" | tail -1)
  printf '%s\t%s\n' "$T" "$LINE" >> "$OUT"
  echo "$T $LINE"
done
echo SMOKE_LIT_DONE >> "$OUT"
