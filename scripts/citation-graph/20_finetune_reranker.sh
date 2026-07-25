#!/bin/bash
# Finetune bge-reranker-v2-m3 on the EVAL-500K citation-graph reranker set (CORE-64).
# Cross-encoder over (query decision, candidate decision); trains on Brev H100s,
# avoiding GPUs 0,1 (qdrant-gpu). Run inside tmux.
#
#   bash 20_finetune_reranker.sh
set -euo pipefail

DATA_DIR=${DATA_DIR:-/data/reranker-train}
OUT_DIR=${OUT_DIR:-$DATA_DIR/bge-reranker-v2-m3-ua-ft}
BASE=${BASE:-BAAI/bge-reranker-v2-m3}
GPUS=${GPUS:-2,3,4,5,6,7}
NPROC=$(echo "$GPUS" | tr ',' '\n' | wc -l)

# MLflow (workstation.lex); falls back to no reporting if unreachable.
export MLFLOW_TRACKING_URI=${MLFLOW_TRACKING_URI:-http://workstation.lex:5000}
export MLFLOW_EXPERIMENT_NAME=${MLFLOW_EXPERIMENT_NAME:-reranker-finetune}
REPORT_TO=${REPORT_TO:-mlflow}

export CUDA_VISIBLE_DEVICES=$GPUS
export TOKENIZERS_PARALLELISM=false

echo "[$(date '+%F %T')] base=$BASE gpus=$GPUS nproc=$NPROC out=$OUT_DIR report=$REPORT_TO"

python3 -m torch.distributed.run --nproc_per_node "$NPROC" \
  -m FlagEmbedding.finetune.reranker.encoder_only.base \
  --model_name_or_path "$BASE" \
  --train_data "$DATA_DIR/ft_train.jsonl" \
  --output_dir "$OUT_DIR" \
  --overwrite_output_dir \
  --train_group_size 8 \
  --query_max_len 512 \
  --passage_max_len 1024 \
  --knowledge_distillation False \
  --learning_rate 6e-5 \
  --num_train_epochs ${EPOCHS:-5} \
  --per_device_train_batch_size 4 \
  --gradient_accumulation_steps ${GRAD_ACCUM:-1} \
  --dataloader_drop_last True \
  --warmup_ratio 0.1 \
  --lr_scheduler_type cosine \
  --bf16 \
  --logging_steps 20 \
  --save_steps ${SAVE_STEPS:-200} \
  --save_total_limit 3 \
  --report_to "$REPORT_TO" \
  --project reranker-finetune

echo "[$(date '+%F %T')] TRAINING DONE -> $OUT_DIR"
