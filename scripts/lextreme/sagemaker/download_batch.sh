#!/bin/bash
# Download results from a batch SageMaker job.
# The batch job saves everything to /opt/ml/model/ which becomes model.tar.gz.
# Inside: results/models/{model}_{epoch}_s{seed}/{eval_results,cross_epoch_results,best_model/}
#
# Usage:
#   ./download_batch.sh td-batch-all-1779088411
#   ./download_batch.sh  # auto-detect latest td-batch-* job

set -euo pipefail
source "$(dirname "$0")/config.sh"

JOB_NAME="${1:-}"

if [ -z "$JOB_NAME" ]; then
  JOB_NAME=$(aws sagemaker list-training-jobs \
    --region "${SM_REGION}" \
    --name-contains "td-batch" \
    --sort-by CreationTime \
    --sort-order Descending \
    --max-results 1 \
    --query 'TrainingJobSummaries[0].TrainingJobName' \
    --output text 2>/dev/null)
  echo "Auto-detected job: ${JOB_NAME}"
fi

STATUS=$(aws sagemaker describe-training-job \
  --region "${SM_REGION}" \
  --training-job-name "${JOB_NAME}" \
  --query TrainingJobStatus \
  --output text 2>/dev/null)

echo "Job: ${JOB_NAME}"
echo "Status: ${STATUS}"

if [ "$STATUS" != "Completed" ] && [ "$STATUS" != "Failed" ] && [ "$STATUS" != "Stopped" ]; then
  echo ""
  echo "Job still running. Results not available yet."
  echo "Monitor: aws sagemaker describe-training-job --region ${SM_REGION} --training-job-name ${JOB_NAME} --query '[TrainingJobStatus,SecondaryStatus]' --output text"
  exit 0
fi

echo ""
echo "=== Downloading model.tar.gz ==="
S3_ARTIFACT="${S3_OUTPUT}${JOB_NAME}/output/model.tar.gz"
TMP_DIR=$(mktemp -d)
TMP_TAR="${TMP_DIR}/model.tar.gz"
trap "rm -rf ${TMP_DIR}" EXIT

if ! aws s3 cp "${S3_ARTIFACT}" "${TMP_TAR}" --region "${SM_REGION}" 2>/dev/null; then
  echo "ERROR: artifact not found at ${S3_ARTIFACT}"
  exit 1
fi

SIZE_MB=$(du -m "${TMP_TAR}" | cut -f1)
echo "  Downloaded: ${SIZE_MB} MB"

echo ""
echo "=== Extracting ==="
tar xzf "${TMP_TAR}" -C "${TMP_DIR}"

# The batch job saves to /opt/ml/model/results/models/{key}/
# Find the results directory
if [ -d "${TMP_DIR}/results/models" ]; then
  SRC="${TMP_DIR}/results/models"
elif [ -d "${TMP_DIR}/results" ]; then
  SRC="${TMP_DIR}/results"
else
  echo "  Listing archive contents:"
  ls -la "${TMP_DIR}/"
  ls -la "${TMP_DIR}/"*/ 2>/dev/null
  echo "ERROR: unexpected archive structure"
  exit 1
fi

# Count experiments
N_EXPERIMENTS=$(ls -d "${SRC}"/*_s* 2>/dev/null | wc -l)
echo "  Found ${N_EXPERIMENTS} experiment results"

# Copy to local results dir, merging with existing
mkdir -p "${RESULTS_DIR}/models"
for exp_dir in "${SRC}"/*; do
  [ -d "$exp_dir" ] || continue
  KEY=$(basename "$exp_dir")
  DST="${RESULTS_DIR}/models/${KEY}"

  if [ -f "${DST}/cross_epoch_results.json" ]; then
    echo "  SKIP (exists): ${KEY}"
  else
    cp -r "$exp_dir" "${DST}"
    echo "  COPIED: ${KEY}"
  fi
done

# Copy batch manifest if present
[ -f "${TMP_DIR}/batch_manifest.json" ] && cp "${TMP_DIR}/batch_manifest.json" "${RESULTS_DIR}/"
[ -f "${TMP_DIR}/results/batch_manifest.json" ] && cp "${TMP_DIR}/results/batch_manifest.json" "${RESULTS_DIR}/" 2>/dev/null

echo ""
echo "=== Summary ==="
N_EVAL=$(find "${RESULTS_DIR}/models" -name "eval_results.json" | wc -l)
N_CROSS=$(find "${RESULTS_DIR}/models" -name "cross_epoch_results.json" | wc -l)
echo "  eval_results.json:        ${N_EVAL}"
echo "  cross_epoch_results.json: ${N_CROSS}"

echo ""
echo "Next steps:"
echo "  python3 scripts/lextreme/train_temporal.py --aggregate"
echo "  Rscript scripts/lextreme/make_figures.R"
