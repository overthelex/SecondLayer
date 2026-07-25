#!/usr/bin/env python3
"""Stage 6: Tokenize structured text and estimate total token count."""

import argparse, json, os, random, sys, time
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).parent))


def load_tokenizer(model_name):
    from transformers import AutoTokenizer
    print(f"Loading tokenizer: {model_name}")
    tok = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    print(f"  Vocab size: {tok.vocab_size}")
    return tok


def estimate_fertility(input_dir, tokenizer, sample_size=10_000):
    shards = [os.path.join(r, f) for r, d, fs in os.walk(input_dir) for f in fs if f.endswith(".parquet")]
    random.shuffle(shards)
    texts = []
    for p in shards:
        if len(texts) >= sample_size: break
        texts.extend(pq.read_table(p, columns=["text"]).column("text").to_pylist())
    texts = texts[:sample_size]
    print(f"Estimating fertility on {len(texts)} docs...")

    total_chars = total_tokens = 0
    lengths = []
    for text in texts:
        if not text: continue
        toks = tokenizer.encode(text, add_special_tokens=False)
        total_chars += len(text); total_tokens += len(toks); lengths.append(len(toks))

    f = total_tokens / max(total_chars, 1)
    stats = {"sample_size": len(texts), "total_chars": total_chars, "total_tokens": total_tokens,
             "fertility_tokens_per_char": round(f, 4),
             "avg_tokens_per_doc": round(total_tokens/max(len(texts),1), 1),
             "median_tokens": int(np.median(lengths)) if lengths else 0,
             "p10": int(np.percentile(lengths, 10)) if lengths else 0,
             "p90": int(np.percentile(lengths, 90)) if lengths else 0}
    print(f"  Fertility: {f:.4f} tok/char, avg {stats['avg_tokens_per_doc']:.0f} tok/doc")
    return stats


def tokenize_shard(shard_path, output_dir, tokenizer):
    texts = pq.read_table(shard_path, columns=["text"]).column("text").to_pylist()
    all_tokens = []
    for text in texts:
        if text: all_tokens.extend(tokenizer.encode(text, add_special_tokens=False))
    if not all_tokens: return {"shard": os.path.basename(shard_path), "tokens": 0}
    out = os.path.join(output_dir, os.path.splitext(os.path.basename(shard_path))[0] + ".npy")
    np.save(out, np.array(all_tokens, dtype=np.int32))
    return {"shard": os.path.basename(shard_path), "tokens": len(all_tokens)}


def main():
    parser = argparse.ArgumentParser(description="Stage 6: Tokenize")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model", default="Qwen/Qwen2.5-72B")
    parser.add_argument("--sample-only", action="store_true")
    parser.add_argument("--sample-size", type=int, default=10_000)
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    t0 = time.time()
    tokenizer = load_tokenizer(args.model)
    fs = estimate_fertility(args.input_dir, tokenizer, args.sample_size)
    with open(os.path.join(args.output_dir, "fertility_stats.json"), "w") as f:
        json.dump(fs, f, indent=2)

    shards = sorted([os.path.join(r, f) for r, d, files in os.walk(args.input_dir) for f in files if f.endswith(".parquet")])
    est = sum(pq.read_metadata(p).num_rows for p in shards) * fs["avg_tokens_per_doc"]
    print(f"Estimated total: {est/1e9:.1f}B tokens")
    if args.sample_only: return

    token_dir = os.path.join(args.output_dir, "tokens")
    os.makedirs(token_dir, exist_ok=True)
    total = 0
    for i, p in enumerate(shards):
        s = tokenize_shard(p, token_dir, tokenizer)
        total += s["tokens"]
        if (i+1) % 10 == 0: print(f"  {i+1}/{len(shards)}, {total/1e9:.2f}B tokens")

    print(f"\nStage 6 complete in {(time.time()-t0)/60:.1f} min. Total: {total/1e9:.2f}B tokens")
    with open(os.path.join(args.output_dir, "tokenize_stats.json"), "w") as f:
        json.dump({**fs, "total_tokens": total, "total_tokens_B": round(total/1e9, 2)}, f, indent=2)

if __name__ == "__main__":
    main()
