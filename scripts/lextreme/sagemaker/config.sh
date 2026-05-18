#!/bin/bash
# Shared config for all SageMaker temporal drift scripts.
# Source this file: source scripts/lextreme/sagemaker/config.sh

export SM_IMAGE="763104351884.dkr.ecr.us-west-2.amazonaws.com/huggingface-pytorch-training:2.5.1-transformers4.49.0-gpu-py311-cu124-ubuntu22.04-v2.0-2025-04-07-19-42-26"
export SM_REGION="us-west-2"
export SM_ROLE="arn:aws:iam::272594900302:role/SageMakerDPOExecutionRole"
export SM_INSTANCE="ml.g5.12xlarge"
export SM_VOLUME_GB=200
export SM_MAX_RUNTIME=14400

export S3_BUCKET="s3://secondlayer-rlhf-exp4"
export S3_PREFIX="temporal-drift"
export S3_CODE="${S3_BUCKET}/${S3_PREFIX}/code/sourcedir.tar.gz"
export S3_DATA="${S3_BUCKET}/${S3_PREFIX}/data/"
export S3_OUTPUT="${S3_BUCKET}/${S3_PREFIX}/output/"

export SM_HF_TOKEN=$(cat ~/.cache/huggingface/token 2>/dev/null || echo "")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LEXTREME_DIR="$(dirname "${SCRIPT_DIR}")"
export DATA_DIR="${LEXTREME_DIR}/output"
export RESULTS_DIR="${LEXTREME_DIR}/results"
export STATE_DIR="${LEXTREME_DIR}/sagemaker/state"

mkdir -p "${STATE_DIR}" "${RESULTS_DIR}"

MODELS=("xlm-roberta-base" "xlm-roberta-large" "legal-xlm-roberta-base" "legal-xlm-roberta-large")
EPOCHS=("pre_war" "hybrid_war" "full_scale")
SEEDS=(42 123 456)
