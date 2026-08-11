#!/bin/bash
# Window A after the expiry-date correction and the addition of articles 253/254.
#
# The previous run failed C-011 because the criterion demanded 13.02.2022, a Sunday, while the
# model correctly applied the next-working-day rule and said 14.02.2022. The rule is now in the
# workspace and the criterion expects the corrected date WITH that basis, so this run says
# whether the task now rewards the reasoning it should.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
export LAB_MATCHER_BEDROCK=eu.anthropic.claude-sonnet-4-6
T=litigation-dispute-resolution/ua-limitation-window-before-p19
RID=winA-after-254
uv run --with "anthropic[bedrock]" python -m harness.run \
    --model bedrock/eu.anthropic.claude-sonnet-4-6 --task "$T" \
    --max-turns 40 --run-id "$RID" > /tmp/$RID.run.log 2>&1
uv run --with "anthropic[bedrock]" python -m evaluation.run_eval \
    --run-id "$RID" --task "$T" --judge-model eu.anthropic.claude-sonnet-4-6 \
    --parallel 6 2>&1 | grep -E "criteria passed" | tail -1 > ~/harness-lab/winA.log
echo WINA_DONE >> ~/harness-lab/winA.log
