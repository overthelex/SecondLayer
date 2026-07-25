#!/bin/bash
# Compare SFT (merged) vs SFT+DPO-dehedge on 8 GPUs: citation-faithfulness + hedge rate.
# The point: did DPO remove the compulsive 'джерел недостатньо' hedge without losing citations?
set -u
cd /data/sft-train
export HF_HOME=/data/hf_cache
SFTM=/data/cpt-pipeline/12_sft_merged
DPO=/data/cpt-pipeline/13_dpo_dehedge_output/final
D=/data/sft-distill/run_100k/retrieved.jsonl
N=${N:-240}; NG=${NG:-8}

run_dp () {  # $1=label  rest=extra args (e.g. --adapter ...)
  local label="$1"; shift
  rm -f shard_${label}_*.json
  for g in $(seq 0 $((NG-1))); do
    CUDA_VISIBLE_DEVICES=$g python3 eval_sft.py --base-model "$SFTM" "$@" \
        --eval-data "$D" --n "$N" --label "$label" \
        --shard-idx "$g" --shard-count "$NG" --output "shard_${label}_${g}.json" &
  done
  wait
  python3 merge_eval.py "shard_${label}_*.json" "eval_${label}.json"
}

echo "=== SFT (merged, no DPO) ==="
run_dp sftm
echo "=== SFT + DPO de-hedge ==="
run_dp dpo --adapter "$DPO"
echo "=== DONE compare ==="
