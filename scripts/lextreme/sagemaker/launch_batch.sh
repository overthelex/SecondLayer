#!/bin/bash
# Launch ONE SageMaker job that runs ALL experiments in parallel across 4 GPUs.
# Base models: 4 parallel (1 per GPU). Large models: 2 parallel.
#
# Usage:
#   ./launch_batch.sh                      # all 36 training experiments
#   ./launch_batch.sh --base-only          # only base models (18 jobs, ~3h)
#   ./launch_batch.sh --continual          # continual learning experiments
#   ./launch_batch.sh --model xlm-roberta-base  # single model, all epochs×seeds
#   ./launch_batch.sh --dry-run            # show config without launching

set -euo pipefail
source "$(dirname "$0")/config.sh"

DRY_RUN=false
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)    DRY_RUN=true; shift ;;
    --base-only)  EXTRA_ARGS="${EXTRA_ARGS} --base-only"; shift ;;
    --continual)  EXTRA_ARGS="${EXTRA_ARGS} --continual"; shift ;;
    --embeddings) EXTRA_ARGS="${EXTRA_ARGS} --embeddings"; shift ;;
    --model)      EXTRA_ARGS="${EXTRA_ARGS} --model $2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# --- Step 1: Upload code ---
echo "=== Packaging code ==="
TMPDIR=$(mktemp -d)
trap "rm -rf ${TMPDIR}" EXIT

mkdir -p "${TMPDIR}/code"
cp "${LEXTREME_DIR}/train_temporal.py" "${TMPDIR}/code/"
cp "${LEXTREME_DIR}/batch_train.py" "${TMPDIR}/code/"
cp "${LEXTREME_DIR}/requirements.txt" "${TMPDIR}/code/"

(cd "${TMPDIR}/code" && tar czf "${TMPDIR}/sourcedir.tar.gz" .)

if [ "$DRY_RUN" = false ]; then
  aws s3 cp "${TMPDIR}/sourcedir.tar.gz" "${S3_CODE}" --region "${SM_REGION}"
  echo "  Uploaded: ${S3_CODE}"
fi

# --- Step 2: Check data ---
echo ""
echo "=== Checking data on S3 ==="
MISSING=0
for epoch in pre_war hybrid_war full_scale; do
  for split in train validation test; do
    if ! aws s3 ls "${S3_DATA}${epoch}/${split}.jsonl" --region "${SM_REGION}" > /dev/null 2>&1; then
      echo "  MISSING: ${epoch}/${split}.jsonl -- run upload_data.sh first"
      MISSING=$((MISSING + 1))
    fi
  done
done

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo "ERROR: ${MISSING} data files missing. Run: ./sagemaker/upload_data.sh"
  exit 1
fi
echo "  All data present"

# --- Step 3: Launch ---
TS=$(date +%s)
JOB_NAME="td-batch-all-${TS}"

# 24h timeout for full batch (36 runs across 4 GPUs)
BATCH_MAX_RUNTIME=86400

HYPERPARAMS="{
  \"sagemaker_program\": \"batch_train.py\",
  \"sagemaker_submit_directory\": \"${S3_CODE}\"
}"

# Add extra args as hyperparameters if present
if [ -n "${EXTRA_ARGS}" ]; then
  # Convert --base-only --model xlm-roberta-base to sagemaker hyperparams
  ARGS_CLEAN=$(echo "${EXTRA_ARGS}" | sed 's/^ *//')
  HYPERPARAMS="{
    \"sagemaker_program\": \"batch_train.py\",
    \"sagemaker_submit_directory\": \"${S3_CODE}\",
    \"sagemaker_program_args\": \"${ARGS_CLEAN}\"
  }"
fi

echo ""
echo "=== Job config ==="
echo "  Name:     ${JOB_NAME}"
echo "  Instance: ${SM_INSTANCE} (4x A10G)"
echo "  Timeout:  ${BATCH_MAX_RUNTIME}s (24h)"
echo "  Args:     ${EXTRA_ARGS:-<all experiments>}"
echo "  Program:  batch_train.py"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "[DRY-RUN] Would launch: ${JOB_NAME}"
  echo "  Hyperparams: ${HYPERPARAMS}"
  exit 0
fi

cat > /tmp/sm-batch-job.json << SMEOF
{
  "TrainingJobName": "${JOB_NAME}",
  "AlgorithmSpecification": {
    "TrainingImage": "${SM_IMAGE}",
    "TrainingInputMode": "File"
  },
  "RoleArn": "${SM_ROLE}",
  "InputDataConfig": [
    {
      "ChannelName": "data",
      "DataSource": {
        "S3DataSource": {
          "S3DataType": "S3Prefix",
          "S3Uri": "${S3_DATA}",
          "S3DataDistributionType": "FullyReplicated"
        }
      }
    }
  ],
  "OutputDataConfig": {"S3OutputPath": "${S3_OUTPUT}"},
  "ResourceConfig": {
    "InstanceType": "${SM_INSTANCE}",
    "InstanceCount": 1,
    "VolumeSizeInGB": ${SM_VOLUME_GB}
  },
  "StoppingCondition": {"MaxRuntimeInSeconds": ${BATCH_MAX_RUNTIME}},
  "HyperParameters": ${HYPERPARAMS},
  "Environment": {
    "HF_TOKEN": "${SM_HF_TOKEN}",
    "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"
  }
}
SMEOF

echo ""
if aws sagemaker create-training-job \
    --region "${SM_REGION}" \
    --cli-input-json file:///tmp/sm-batch-job.json \
    --output text 2>/tmp/sm-launch-err.txt; then
  echo "LAUNCHED: ${JOB_NAME}"
  echo ""
  echo "Monitor:"
  echo "  aws sagemaker describe-training-job --region ${SM_REGION} --training-job-name ${JOB_NAME} --query '[TrainingJobStatus,SecondaryStatus]' --output text"
  echo ""
  echo "Logs:"
  echo "  aws logs tail /aws/sagemaker/TrainingJobs --log-stream-name-prefix ${JOB_NAME} --follow --region ${SM_REGION}"
  echo ""
  echo "Stop:"
  echo "  aws sagemaker stop-training-job --region ${SM_REGION} --training-job-name ${JOB_NAME}"
else
  echo "FAILED: $(cat /tmp/sm-launch-err.txt)"
  exit 1
fi
