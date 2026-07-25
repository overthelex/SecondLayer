#!/usr/bin/env python3
"""Stage 7: Package tokenized data into training-ready shards."""

import argparse, json, os, sys, time
import numpy as np


def main():
    parser = argparse.ArgumentParser(description="Stage 7: Package")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-seq-length", type=int, default=8192)
    parser.add_argument("--shard-size-mb", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--target-tokens", default=None)
    args = parser.parse_args()
    t0 = time.time()

    files = sorted([os.path.join(args.input_dir, f) for f in os.listdir(args.input_dir) if f.endswith(".npy")])
    if not files: print("No .npy files"); return

    print(f"Loading {len(files)} token files...")
    arrays = [np.load(f) for f in files]
    total = sum(len(a) for a in arrays)
    print(f"  Total: {total:,} ({total/1e9:.2f}B) tokens")

    combined = np.concatenate(arrays); del arrays
    n_seq = len(combined) // args.max_seq_length
    combined = combined[:n_seq * args.max_seq_length].reshape(n_seq, args.max_seq_length)

    if args.target_tokens:
        t = args.target_tokens.upper()
        mul = 1e9 if t.endswith("B") else 1e6 if t.endswith("M") else 1
        target = int(float(t.rstrip("BM")) * mul)
        if total > target:
            target_seq = target // args.max_seq_length
            combined = combined[:target_seq]
            print(f"Subsampled to {target_seq:,} sequences ({args.target_tokens})")

    rng = np.random.RandomState(args.seed)
    combined = combined[rng.permutation(len(combined))]

    os.makedirs(args.output_dir, exist_ok=True)
    bps = args.max_seq_length * 4
    sps = max(1, (args.shard_size_mb * 1024 * 1024) // bps)
    stats = []
    for i in range(0, len(combined), sps):
        shard = combined[i:i+sps]
        path = os.path.join(args.output_dir, f"shard_{i//sps:05d}.npy")
        np.save(path, shard)
        stats.append({"name": os.path.basename(path), "sequences": len(shard),
                       "size_mb": round(os.path.getsize(path)/1048576, 1)})

    ts = sum(s["sequences"] for s in stats)
    sz = sum(s["size_mb"] for s in stats)
    print(f"\nStage 7 complete in {(time.time()-t0)/60:.1f} min. {len(stats)} shards, {ts:,} seqs, {sz/1024:.1f} GB, {ts*args.max_seq_length/1e9:.2f}B tokens")
    with open(os.path.join(args.output_dir, "package_stats.json"), "w") as f:
        json.dump({"total_sequences": ts, "max_seq_length": args.max_seq_length,
                    "total_tokens_B": round(ts*args.max_seq_length/1e9, 2),
                    "num_shards": len(stats), "total_size_gb": round(sz/1024, 2)}, f, indent=2)

if __name__ == "__main__":
    main()
