#!/usr/bin/env python3
"""Stage 3: Near-duplicate removal via MinHash LSH."""

import argparse, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).parent))
try:
    from datasketch import MinHash, MinHashLSH
except ImportError:
    print("Install datasketch: pip install datasketch mmh3"); sys.exit(1)

NUM_PERM = 128
LSH_THRESHOLD = 0.5
JACCARD_CONFIRM = 0.8
SHINGLE_K = 5


def text_to_shingles(text, k=SHINGLE_K):
    words = text.lower().split()
    if len(words) < k:
        return {" ".join(words)}
    return {" ".join(words[i:i+k]) for i in range(len(words) - k + 1)}


def compute_minhash(text):
    m = MinHash(num_perm=NUM_PERM)
    for s in text_to_shingles(text):
        m.update(s.encode('utf-8'))
    return m


def compute_minhash_for_shard(shard_path):
    table = pq.read_table(shard_path, columns=["doc_id", "full_text", "text_length", "source"])
    results = []
    doc_ids = table.column("doc_id").to_pylist()
    texts = table.column("full_text").to_pylist()
    lengths = table.column("text_length").to_pylist() if "text_length" in table.column_names else [0]*len(doc_ids)
    sources = table.column("source").to_pylist() if "source" in table.column_names else ["unknown"]*len(doc_ids)
    for doc_id, text, text_len, source in zip(doc_ids, texts, lengths, sources):
        if not text or len(text) < 100: continue
        results.append((f"{source}:{doc_id}", compute_minhash(text), text_len or len(text)))
    return results


def find_duplicates_in_group(shard_paths, workers):
    print(f"  Computing MinHash for {len(shard_paths)} shards...")
    t0 = time.time()
    all_docs = []
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(compute_minhash_for_shard, p): p for p in shard_paths}
        done = 0
        for future in as_completed(futures):
            done += 1
            try: all_docs.extend(future.result())
            except Exception as e: print(f"    MinHash failed: {e}")
            if done % 20 == 0: print(f"    {done}/{len(shard_paths)} shards hashed, {len(all_docs):,} docs")
    print(f"  MinHash: {len(all_docs):,} docs in {time.time()-t0:.0f}s")
    if not all_docs: return set()

    lsh = MinHashLSH(threshold=LSH_THRESHOLD, num_perm=NUM_PERM)
    doc_map = {}
    for doc_key, mh, text_len in all_docs:
        doc_map[doc_key] = (mh, text_len)
        try: lsh.insert(doc_key, mh)
        except ValueError: pass

    to_remove = set()
    visited = set()
    for doc_key, mh, text_len in all_docs:
        if doc_key in visited or doc_key in to_remove: continue
        candidates = lsh.query(mh)
        if len(candidates) <= 1: continue
        cluster = [(ck, doc_map[ck][1]) for ck in candidates if ck not in to_remove and mh.jaccard(doc_map[ck][0]) >= JACCARD_CONFIRM]
        if len(cluster) <= 1: continue
        cluster.sort(key=lambda x: -x[1])
        visited.add(cluster[0][0])
        for dup_key, _ in cluster[1:]: to_remove.add(dup_key)

    print(f"  Found {len(to_remove):,} duplicates")
    return to_remove


def filter_shard(args_tuple):
    input_path, output_path, remove_keys, source_name = args_tuple
    table = pq.read_table(input_path)
    doc_ids = table.column("doc_id").to_pylist()
    sources = table.column("source").to_pylist() if "source" in table.column_names else [source_name]*len(doc_ids)
    mask = [f"{s}:{d}" not in remove_keys for d, s in zip(doc_ids, sources)]
    filtered = table.filter(pa.array(mask))
    pq.write_table(filtered, output_path, compression="zstd")
    return {"shard": os.path.basename(input_path), "input_rows": table.num_rows,
            "output_rows": filtered.num_rows, "removed": table.num_rows - filtered.num_rows}


def main():
    parser = argparse.ArgumentParser(description="Stage 3: Deduplicate")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    t0 = time.time()

    source_dirs = {}
    for root, dirs, files in os.walk(args.input_dir):
        parquets = sorted([os.path.join(root, f) for f in files if f.endswith(".parquet")])
        if parquets:
            source_dirs[os.path.relpath(root, args.input_dir)] = parquets

    all_stats = {}
    for source_name, shard_paths in source_dirs.items():
        print(f"\nDeduplicating: {source_name} ({len(shard_paths)} shards)")
        total_rows = sum(pq.read_metadata(p).num_rows for p in shard_paths)
        if total_rows < 10_000:
            print(f"  Small source ({total_rows:,}), copying")
            out_dir = os.path.join(args.output_dir, source_name)
            os.makedirs(out_dir, exist_ok=True)
            for p in shard_paths:
                pq.write_table(pq.read_table(p), os.path.join(out_dir, os.path.basename(p)), compression="zstd")
            all_stats[source_name] = {"total": total_rows, "removed": 0, "remaining": total_rows}
            continue

        CHUNK = 50
        all_remove = set()
        for i in range(0, len(shard_paths), CHUNK):
            chunk = shard_paths[i:i+CHUNK]
            all_remove.update(find_duplicates_in_group(chunk, args.workers))

        out_dir = os.path.join(args.output_dir, source_name)
        os.makedirs(out_dir, exist_ok=True)
        tasks = [(p, os.path.join(out_dir, os.path.basename(p)), all_remove, source_name) for p in shard_paths]
        shard_stats = []
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            for future in as_completed({executor.submit(filter_shard, t): t[0] for t in tasks}):
                try: shard_stats.append(future.result())
                except Exception as e: print(f"  Filter failed: {e}")

        total_in = sum(s["input_rows"] for s in shard_stats)
        total_out = sum(s["output_rows"] for s in shard_stats)
        print(f"  {source_name}: {total_in:,} -> {total_out:,} ({(total_in-total_out)/max(total_in,1)*100:.1f}% removed)")
        all_stats[source_name] = {"total": total_in, "removed": total_in-total_out, "remaining": total_out}

    elapsed = time.time() - t0
    print(f"\nStage 3 complete in {elapsed/60:.1f} min")
    with open(os.path.join(args.output_dir, "dedup_stats.json"), "w") as f:
        json.dump(all_stats, f, indent=2)

if __name__ == "__main__":
    main()
