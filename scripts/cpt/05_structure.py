#!/usr/bin/env python3
"""Stage 5: Structure documents for CPT with boundary tokens."""

import argparse, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).parent))
from utils.db import JUSTICE_KINDS

SCHEMA = pa.schema([pa.field("text", pa.large_string()), pa.field("source", pa.string()), pa.field("text_length", pa.int32())])
DOC_START, DOC_END = "<|begin_of_text|>", "<|end_of_text|>"


def structure_shard(input_path, output_path):
    table = pq.read_table(input_path)
    cols = table.column_names
    texts = table.column("full_text").to_pylist()
    sources = table.column("source").to_pylist() if "source" in cols else ["unknown"]*table.num_rows
    years = table.column("adj_year").to_pylist() if "adj_year" in cols else [0]*table.num_rows
    jkinds = table.column("justice_kind").to_pylist() if "justice_kind" in cols else [0]*table.num_rows
    titles = table.column("title").to_pylist() if "title" in cols else [""]*table.num_rows

    structured = []
    for text, src, year, jk, title in zip(texts, sources, years, jkinds, titles):
        if not text: continue
        if src == "edrsr":
            fmt = f"{DOC_START}\nsource:edrsr lang:uk year:{year} domain:{JUSTICE_KINDS.get(jk,'other')}\n{text}\n{DOC_END}"
        elif "legislation" in src or "legal_acts" in src:
            fmt = f"{DOC_START}\nsource:legislation lang:uk type:{src} title:{title}\n{text}\n{DOC_END}"
        elif src == "echr":
            fmt = f"{DOC_START}\nsource:echr lang:en\n{text}\n{DOC_END}"
        else:
            fmt = f"{DOC_START}\nsource:{src}\n{text}\n{DOC_END}"
        structured.append({"text": fmt, "source": src, "text_length": len(fmt)})

    if structured:
        out = pa.table({k: [r[k] for r in structured] for k in ["text","source","text_length"]}, schema=SCHEMA)
        pq.write_table(out, output_path, compression="zstd")
    return {"shard": os.path.basename(input_path), "input": table.num_rows, "output": len(structured)}


def main():
    parser = argparse.ArgumentParser(description="Stage 5: Structure for CPT")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    t0 = time.time()

    files = [os.path.join(r, f) for r, d, fs in os.walk(args.input_dir) for f in fs if f.endswith(".parquet")]
    print(f"Structuring {len(files)} shards")
    tasks = []
    for ip in files:
        op = os.path.join(args.output_dir, os.path.relpath(ip, args.input_dir))
        os.makedirs(os.path.dirname(op), exist_ok=True)
        tasks.append((ip, op))

    stats = []
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(structure_shard, i, o): i for i, o in tasks}
        done = 0
        for f in as_completed(futures):
            done += 1
            try: stats.append(f.result())
            except Exception as e: print(f"  FAILED: {e}")
            if done % 20 == 0: print(f"  {done}/{len(tasks)}")

    ti, to = sum(s["input"] for s in stats), sum(s["output"] for s in stats)
    print(f"\nStage 5 complete in {time.time()-t0:.0f}s. Input: {ti:,}, Output: {to:,}")
    with open(os.path.join(args.output_dir, "structure_stats.json"), "w") as f:
        json.dump({"total_input": ti, "total_output": to}, f, indent=2)

if __name__ == "__main__":
    main()
