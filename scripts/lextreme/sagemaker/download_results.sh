#!/bin/bash
# Download results from S3 for completed jobs.
# Extracts model.tar.gz artifacts into results/models/.
#
# Usage:
#   ./download_results.sh              # all completed
#   ./download_results.sh --job-key xlm-roberta-base_pre_war_s42  # one job

set -euo pipefail
source "$(dirname "$0")/config.sh"

FILTER_KEY=""
for arg in "$@"; do
  case $arg in
    --job-key) FILTER_KEY="$2"; shift 2 ;;
  esac
done

DOWNLOADED=0
SKIPPED=0

for state_file in "${STATE_DIR}"/*.json; do
  [ -f "$state_file" ] || continue

  JOB_KEY=$(basename "$state_file" .json)
  [ -n "$FILTER_KEY" ] && [ "$JOB_KEY" != "$FILTER_KEY" ] && continue

  STATUS=$(python3 -c "import json; print(json.load(open('${state_file}'))['status'])" 2>/dev/null)
  JOB_NAME=$(python3 -c "import json; print(json.load(open('${state_file}'))['job_name'])" 2>/dev/null)

  if [ "$STATUS" != "Completed" ]; then
    continue
  fi

  OUT_DIR="${RESULTS_DIR}/models/${JOB_KEY}"
  if [ -f "${OUT_DIR}/cross_epoch_results.json" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "Downloading: ${JOB_KEY} (${JOB_NAME})"

  S3_ARTIFACT="${S3_OUTPUT}${JOB_NAME}/output/model.tar.gz"
  TMP_TAR=$(mktemp)
  trap "rm -f ${TMP_TAR}" EXIT

  if aws s3 cp "${S3_ARTIFACT}" "${TMP_TAR}" --region "${SM_REGION}" 2>/dev/null; then
    mkdir -p "${OUT_DIR}"
    tar xzf "${TMP_TAR}" -C "${OUT_DIR}"
    DOWNLOADED=$((DOWNLOADED + 1))
    echo "  Extracted to: ${OUT_DIR}"
  else
    echo "  WARNING: artifact not found at ${S3_ARTIFACT}"
  fi

  rm -f "${TMP_TAR}"
  trap - EXIT
done

echo ""
echo "Done: ${DOWNLOADED} downloaded, ${SKIPPED} already local"

if [ "$DOWNLOADED" -gt 0 ]; then
  echo ""
  echo "Next steps:"
  echo "  python3 scripts/lextreme/train_temporal.py --aggregate"
  echo "  Rscript scripts/lextreme/make_figures.R"
fi
