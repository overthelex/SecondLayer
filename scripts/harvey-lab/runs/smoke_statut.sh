#!/bin/bash
# One run of the charter-review pilot. Smoke first, always: the last full launch had to be
# killed three tasks in because the rubric was inflating rather than measuring.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6
T=corporate-ma/ua-statut-tov-compliance-review
RID=smoke-statut-1
uv run --with "anthropic[bedrock]" python -m harness.run \
    --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
    --max-turns 40 --run-id "$RID" > /tmp/$RID.run.log 2>&1
uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
    --run-id "$RID" --task "$T" --judge-model eu.anthropic.claude-sonnet-4-6 \
    --parallel 6 2>&1 | grep -E "criteria passed|Score:" | tail -2 > ~/harness-lab/smoke_statut.log
echo SMOKE_STATUT_DONE >> ~/harness-lab/smoke_statut.log
cat ~/harness-lab/smoke_statut.log
