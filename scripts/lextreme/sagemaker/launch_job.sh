#!/bin/bash
# Launch ONE SageMaker training job. Atomic and idempotent.
# Checks state/ dir -- if job already completed, skips.
#
# Usage:
#   ./launch_job.sh --model xlm-roberta-base --epoch pre_war --seed 42
#   ./launch_job.sh --model xlm-roberta-base --epoch pre_war --seed 42 --wait
#   ./launch_job.sh --model xlm-roberta-base --continual forward --seed 42
#   ./launch_job.sh --model xlm-roberta-base --epoch pre_war --seed 42 --dry-run

set -euo pipefail
source "$(dirname "$0")/config.sh"

MODEL="" EPOCH="" SEED="" CONTINUAL="" WAIT=false DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --model)     MODEL="$2"; shift 2 ;;
    --epoch)     EPOCH="$2"; shift 2 ;;
    --seed)      SEED="$2"; shift 2 ;;
    --continual) CONTINUAL="$2"; shift 2 ;;
    --wait)      WAIT=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[ -z "$MODEL" ] && echo "ERROR: --model required" && exit 1
[ -z "$SEED" ]  && echo "ERROR: --seed required" && exit 1
[ -z "$EPOCH" ] && [ -z "$CONTINUAL" ] && echo "ERROR: --epoch or --continual required" && exit 1

# --- Build job key (used for state tracking) ---
if [ -n "$CONTINUAL" ]; then
  JOB_KEY="continual_${CONTINUAL}_${MODEL}_s${SEED}"
  HYPERPARAMS="{
    \"sagemaker_program\": \"train_temporal.py\",
    \"sagemaker_submit_directory\": \"${S3_CODE}\",
    \"model\": \"${MODEL}\",
    \"continual\": \"${CONTINUAL}\",
    \"seed\": \"${SEED}\"
  }"
  LABEL="continual ${CONTINUAL} / ${MODEL} / seed=${SEED}"
else
  JOB_KEY="${MODEL}_${EPOCH}_s${SEED}"
  HYPERPARAMS="{
    \"sagemaker_program\": \"train_temporal.py\",
    \"sagemaker_submit_directory\": \"${S3_CODE}\",
    \"model\": \"${MODEL}\",
    \"epoch\": \"${EPOCH}\",
    \"seed\": \"${SEED}\"
  }"
  LABEL="${MODEL} / ${EPOCH} / seed=${SEED}"
fi

STATE_FILE="${STATE_DIR}/${JOB_KEY}.json"

# --- Check if already done ---
if [ -f "${STATE_FILE}" ]; then
  PREV_STATUS=$(python3 -c "import json; print(json.load(open('${STATE_FILE}'))['status'])" 2>/dev/null || echo "unknown")
  if [ "$PREV_STATUS" = "Completed" ]; then
    echo "SKIP: ${LABEL} -- already completed"
    exit 0
  fi
  echo "RETRY: ${LABEL} -- previous status: ${PREV_STATUS}"
fi

# --- Generate job name ---
TS=$(date +%s)
SHORT_MODEL="${MODEL//legal-xlm-roberta/lxr}"
SHORT_MODEL="${SHORT_MODEL//xlm-roberta/xr}"
if [ -n "$CONTINUAL" ]; then
  JOB_NAME="td-cont-${SHORT_MODEL}-${CONTINUAL:0:3}-s${SEED}-${TS}"
else
  JOB_NAME="td-${SHORT_MODEL}-${EPOCH}-s${SEED}-${TS}"
fi

echo "=== ${LABEL} ==="
echo "  Job name:  ${JOB_NAME}"
echo "  State key: ${JOB_KEY}"

if [ "$DRY_RUN" = true ]; then
  echo "  [DRY-RUN] Would launch with hyperparams:"
  echo "  ${HYPERPARAMS}"
  exit 0
fi

# --- Create job spec ---
JOB_SPEC=$(mktemp)
trap "rm -f ${JOB_SPEC}" EXIT

cat > "${JOB_SPEC}" << SMEOF
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
  "StoppingCondition": {"MaxRuntimeInSeconds": ${SM_MAX_RUNTIME}},
  "HyperParameters": ${HYPERPARAMS},
  "Environment": {
    "HF_TOKEN": "${SM_HF_TOKEN}",
    "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"
  }
}
SMEOF

# --- Launch ---
if ! aws sagemaker create-training-job \
    --region "${SM_REGION}" \
    --cli-input-json "file://${JOB_SPEC}" \
    --output text 2>/tmp/sm-launch-err.txt; then
  ERR=$(cat /tmp/sm-launch-err.txt)
  echo "  FAILED to launch: ${ERR}"
  python3 -c "
import json
json.dump({
  'job_key': '${JOB_KEY}', 'job_name': '${JOB_NAME}',
  'status': 'LaunchFailed', 'error': '''${ERR}'''
}, open('${STATE_FILE}', 'w'), indent=2)
"
  exit 1
fi

echo "  Launched: ${JOB_NAME}"

# --- Save state ---
python3 -c "
import json, time
json.dump({
  'job_key': '${JOB_KEY}', 'job_name': '${JOB_NAME}',
  'model': '${MODEL}', 'epoch': '${EPOCH}', 'seed': ${SEED},
  'continual': '${CONTINUAL}' or None,
  'status': 'InProgress', 'launched_at': time.strftime('%Y-%m-%dT%H:%M:%SZ')
}, open('${STATE_FILE}', 'w'), indent=2)
"

# --- Wait if requested ---
if [ "$WAIT" = true ]; then
  echo "  Waiting for completion..."
  while true; do
    STATUS=$(aws sagemaker describe-training-job \
      --region "${SM_REGION}" \
      --training-job-name "${JOB_NAME}" \
      --query TrainingJobStatus --output text 2>/dev/null)

    case "${STATUS}" in
      Completed)
        echo "  COMPLETED: ${JOB_NAME}"
        python3 -c "
import json
d = json.load(open('${STATE_FILE}'))
d['status'] = 'Completed'
json.dump(d, open('${STATE_FILE}', 'w'), indent=2)
"
        exit 0
        ;;
      Failed|Stopped)
        REASON=$(aws sagemaker describe-training-job \
          --region "${SM_REGION}" \
          --training-job-name "${JOB_NAME}" \
          --query FailureReason --output text 2>/dev/null || echo "unknown")
        echo "  ${STATUS}: ${REASON}"
        python3 -c "
import json
d = json.load(open('${STATE_FILE}'))
d['status'] = '${STATUS}'
d['error'] = '${REASON}'
json.dump(d, open('${STATE_FILE}', 'w'), indent=2)
"
        exit 1
        ;;
    esac
    sleep 30
  done
fi
