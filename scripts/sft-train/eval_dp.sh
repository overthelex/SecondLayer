#!/bin/bash
# Data-parallel citation-faithfulness eval on 8 GPUs: each GPU runs a full copy of
# the 14B over 1/8 of the examples. Runs base then SFT, merges shard counts.
set -u
cd /data/sft-train
export HF_HOME=/data/hf_cache
B=/data/cpt-pipeline/09_checkpoints/qwen25-14b/checkpoint-3000/checkpoint-3000/final
A=/data/cpt-pipeline/12_sft_output_14b/final
D=/data/sft-distill/run_100k/retrieved.jsonl
N=${N:-240}
NG=${NG:-8}

run_dp () {  # $1=label  $2=adapter-args
  local label="$1"; shift
  rm -f shard_${label}_*.json
  for g in $(seq 0 $((NG-1))); do
    CUDA_VISIBLE_DEVICES=$g python3 eval_sft.py --base-model "$B" "$@" \
        --eval-data "$D" --n "$N" --label "$label" \
        --shard-idx "$g" --shard-count "$NG" \
        --output "shard_${label}_${g}.json" &
  done
  wait
  python3 merge_eval.py "shard_${label}_*.json" "eval_${label}.json"
}

echo "=== BASE (8-GPU data-parallel) ==="
run_dp base
echo "=== SFT (8-GPU data-parallel) ==="
run_dp sft --adapter "$A"
echo "=== DONE ==="
