#!/bin/bash
# Re-eval SFT with the SOFTER system prompt (8-GPU data-parallel) to test whether
# over-hedging is prompt-driven. Compare eval_sft_soft.json vs eval_sft.json.
set -u
cd /data/sft-train
export HF_HOME=/data/hf_cache
B=/data/cpt-pipeline/09_checkpoints/qwen25-14b/checkpoint-3000/checkpoint-3000/final
A=/data/cpt-pipeline/12_sft_output_14b/final
D=/data/sft-distill/run_100k/retrieved.jsonl
N=${N:-240}; NG=${NG:-8}

rm -f shard_sftsoft_*.json
for g in $(seq 0 $((NG-1))); do
  CUDA_VISIBLE_DEVICES=$g python3 eval_sft.py --base-model "$B" --adapter "$A" \
      --eval-data "$D" --n "$N" --label sftsoft --soft-prompt \
      --shard-idx "$g" --shard-count "$NG" --output "shard_sftsoft_${g}.json" &
done
wait
python3 merge_eval.py "shard_sftsoft_*.json" "eval_sft_soft.json"
echo "=== DONE soft ==="
