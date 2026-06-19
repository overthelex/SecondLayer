#!/bin/bash
# SFT of CPT-14B on citation-grounded ChatML data (LEXAI-1734). Runs on Brev 8xH100.
# Logs to the old MLflow server (cpt-qwen25-edrsr) — reachable via WG since 2026-06-18.
set -euo pipefail

export HF_HOME=/data/hf_cache
export MLFLOW_TRACKING_URI=http://10.88.0.8:5000
export MLFLOW_TRACKING_USERNAME=admin
export MLFLOW_TRACKING_PASSWORD=${MLFLOW_TRACKING_PASSWORD:-xzTZmZ5gi52ZPRCv7PZUgC56dmkQJ6Ch}
export MLFLOW_EXPERIMENT_NAME=cpt-qwen25-edrsr

CPT_MODEL=${CPT_MODEL:-/data/cpt-pipeline/09_checkpoints/qwen25-14b/checkpoint-3000/checkpoint-3000/final}
DATA=${DATA:-/data/sft-distill/run_30k/sft_chatml.jsonl}
OUTPUT=${OUTPUT:-/data/cpt-pipeline/12_sft_output_14b}
MAX_STEPS=${MAX_STEPS:-0}      # >0 = smoke test
SFT_DIR=$(dirname "$0")

echo "=== SFT 14B ==="
echo "Model: $CPT_MODEL"
echo "Data:  $DATA ($(wc -l < "$DATA") examples)"
echo "Out:   $OUTPUT | max_steps=$MAX_STEPS | GPUs visible: ${CUDA_VISIBLE_DEVICES:-all}"

python3 "$SFT_DIR/train_sft.py" \
    --model-path "$CPT_MODEL" \
    --data-path "$DATA" \
    --output-dir "$OUTPUT" \
    --epochs 3 \
    --lr 2e-4 \
    --micro-batch-size 1 \
    --gradient-accumulation-steps 8 \
    --max-length 2048 \
    --lora-r 16 \
    --lora-alpha 32 \
    --max-steps "$MAX_STEPS"

echo "=== SFT complete -> $OUTPUT/final ==="
