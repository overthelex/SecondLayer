#!/bin/bash
# A/B Phase 0 end-to-end: genb (8-GPU DP) -> judge (Bedrock) -> report.
set -eu
cd /data/ab-phase0
export HF_HOME=/data/hf_cache AWS_REGION=eu-central-1
N=${N:-160}; NG=8

echo "=== [1/3] genb: local model + validator (8-GPU DP, N=$N) ==="
rm -f b_shard_*.jsonl b.jsonl
for g in $(seq 0 $((NG-1))); do
  CUDA_VISIBLE_DEVICES=$g python3 phase0_replay.py genb --n "$N" \
      --shard-idx "$g" --shard-count "$NG" --output "b_shard_${g}.jsonl" &
done
wait
cat b_shard_*.jsonl > b.jsonl
echo "B answers: $(wc -l < b.jsonl)"

echo "=== [2/3] judge: Bedrock A (Sonnet 4.5) + pairwise vs B ==="
python3 phase0_replay.py judge --input b.jsonl --output judged.jsonl --workers 16

echo "=== [3/3] report ==="
python3 phase0_replay.py report --input judged.jsonl --output phase0_report.json
echo "=== DONE phase0 ==="
