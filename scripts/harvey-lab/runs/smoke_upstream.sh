#!/bin/bash
# End-to-end smoke of the schema-only branch against UNMODIFIED upstream tasks.
#
# This is the one claim in the PR a maintainer would otherwise have to take on trust: that the
# branch runs and grades an existing English task exactly as before. Everything else is offline
# tests. Three of the smallest graded tasks are used, on Haiku 4.5 as CONTRIBUTING suggests,
# with the 20-turn cap it suggests.
#
# The API key is read from a file rather than passed on a command line, so it never appears in
# an argument list or a process table.
set -u
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export ANTHROPIC_API_KEY="$(cat ~/.anthropic_key)"

MODEL=anthropic/claude-haiku-4-5-20251001
JUDGE=claude-haiku-4-5-20251001
OUT=~/harness-lab/smoke_upstream.log
: > "$OUT"

echo "branch: $(git branch --show-current)  head: $(git log --oneline -1)" >> "$OUT"

for T in trusts-estates-private-client/compare-trust-documents-against-client-instructions \
         employment-labor/identify-issues-in-counterparty-motion-brief \
         immigration/compare-uscis-filing-receipt-against-original-petition-submission; do
  RID="upstream-smoke-$(echo "$T" | tr '/' '-')"
  uv run python -m harness.run --model "$MODEL" --task "$T" \
      --max-turns 20 --run-id "$RID" > "/tmp/${RID}.run.log" 2>&1
  RC=$?
  LINE=$(uv run python -m evaluation.run_eval --run-id "$RID" --task "$T" \
      --judge-model "$JUDGE" --parallel 6 2>&1 | grep -E "criteria passed" | tail -1)
  TOK=$(python3 -c "
import json,glob
p=glob.glob('results/$RID/**/metrics.json',recursive=True)+glob.glob('results/$RID/metrics.json')
d=json.load(open(p[0])) if p else {}
print(f\"turns={d.get('turn_count','?')} in={d.get('input_tokens','?')} out={d.get('output_tokens','?')}\")
" 2>/dev/null)
  printf '%s\trc=%s\t%s\t%s\n' "$T" "$RC" "$TOK" "$LINE" >> "$OUT"
  echo "$T rc=$RC $TOK $LINE"
done
echo UPSTREAM_SMOKE_DONE >> "$OUT"
