#!/bin/bash
# Fetch one batch of judgment texts through the UAE Lambda.
# Idempotent: an existing non-empty response file means the batch is done, so a
# re-run of the pipeline costs nothing and never refetches.
# Kept as its own script because BSD xargs cannot assemble a long -I{} command
# ("command line cannot be assembled, too long") and silently does nothing.
SD="${UAE_WORK_DIR:-$(cd "$(dirname "$0")" && pwd)/work}"
f="$1"; b=$(basename "$f" .json); out="$SD/resp/$b.json"
[ -s "$out" ] && exit 0
aws --profile "${UAE_PROFILE:-uae}" --region "${UAE_REGION:-me-central-1}" lambda invoke \
    --function-name uae-fetch --cli-read-timeout 0 --cli-connect-timeout 60 \
    --cli-binary-format raw-in-base64-out --payload "file://$f" "$out" >/dev/null 2>&1
