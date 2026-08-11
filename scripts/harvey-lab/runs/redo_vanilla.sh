#!/bin/bash
# Re-derive the vanilla judge pass with per-criterion detail preserved.
#
# The first pass was not archived and scores.json was overwritten by the landed
# pass, so the "which criteria passed" breakdown was lost. This archives the
# landed scores, rolls the landing gate back, re-judges, archives that, and
# restores the gate files.
set -eu
cd ~/harness-lab/harvey-labs
export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=eu-central-1
HOLD="$HOME/harness-lab/gate-files"

echo "=== 1. archive the landed scores currently on disk ==="
find results -path "*sonnet-4-6*" -name scores.json \
  -exec sh -c 'cp "$1" "$(dirname "$1")/scores-landed.json"' _ {} \;
find results -path "*sonnet-4-6*" -name scores-landed.json | wc -l

echo "=== 2. roll back the landing gate ==="
rm -rf "$HOLD"; mkdir -p "$HOLD"
find results -path "*sonnet-4-6*" -path "*/output/*" -type f \
     -newermt "2026-08-10 06:05" -print0 |
while IFS= read -r -d '' f; do
  d="$HOLD/$(dirname "$f")"; mkdir -p "$d"; mv "$f" "$d/"
done
find "$HOLD" -type f | wc -l

echo "=== 3. re-judge vanilla ==="
bash ~/harness-lab/run_judge.sh vanilla2

echo "=== 4. archive the vanilla scores ==="
find results -path "*sonnet-4-6*" -name scores.json \
  -exec sh -c 'cp "$1" "$(dirname "$1")/scores-vanilla.json"' _ {} \;

echo "=== 5. restore the gate files ==="
(cd "$HOLD" && find . -type f -print0) |
while IFS= read -r -d '' rel; do
  cp "$HOLD/$rel" "./${rel#./}"
done
find results -path "*sonnet-4-6*" -path "*/output/*" -type f \
     -newermt "2026-08-10 06:05" 2>/dev/null | wc -l
echo REDO_DONE
