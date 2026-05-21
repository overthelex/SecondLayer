#!/usr/bin/env python3
"""
Stage 2: Clean text in exported parquet shards.
Chunked processing to limit memory. 4 workers default.

Usage:
  python3 scripts/cpt/02_clean.py --input-dir /data/cpt-pipeline/01_raw --output-dir /data/cpt-pipeline/02_clean --workers 4
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).parent))
from utils.text_cleaning import clean_text

CHUNK_SIZE = 50_000


def clean_shard(input_path: str, output_path: str) -> dict:
    pf = pq.ParquetFile(input_path)
    n_rows = pf.metadata.num_rows
    schema = pf.schema_arrow

    text_col = "full_text"
    has_text = text_col in schema.names
    has_length = "text_length" in schema.names

    if not has_text:
        table = pf.read()
        pq.write_table(table, output_path, compression="zstd")
        return {"input": os.path.basename(input_path), "rows": n_rows,
                "empty_after_clean": 0, "rtf_artifacts_cleaned": 0}

    writer = None
    empty_count = 0
    rtf_found = 0
    total_written = 0

    for batch in pf.iter_batches(batch_size=CHUNK_SIZE):
        table_chunk = pa.Table.from_batches([batch], schema=schema)
        texts = table_chunk.column(text_col).to_pylist()

        cleaned_texts = []
        cleaned_lengths = []

        for text in texts:
            if not text:
                cleaned_texts.append("")
                cleaned_lengths.append(0)
                empty_count += 1
                continue

            had_rtf = '\\par' in text[:500] or '\\rtf' in text[:50]
            cleaned = clean_text(text)

            if had_rtf and cleaned != text:
                rtf_found += 1
            if not cleaned:
                empty_count += 1

            cleaned_texts.append(cleaned)
            cleaned_lengths.append(len(cleaned))

        col_idx = table_chunk.column_names.index(text_col)
        table_chunk = table_chunk.set_column(
            col_idx, text_col, pa.array(cleaned_texts, type=pa.large_string()))

        if has_length:
            len_idx = table_chunk.column_names.index("text_length")
            table_chunk = table_chunk.set_column(
                len_idx, "text_length", pa.array(cleaned_lengths, type=pa.int32()))

        if writer is None:
            writer = pq.ParquetWriter(output_path, table_chunk.schema, compression="zstd")
        writer.write_table(table_chunk)
        total_written += len(texts)

        del texts, cleaned_texts, cleaned_lengths, table_chunk

    if writer:
        writer.close()

    return {
        "input": os.path.basename(input_path), "rows": total_written,
        "empty_after_clean": empty_count, "rtf_artifacts_cleaned": rtf_found,
    }


def main():
    parser = argparse.ArgumentParser(description="Stage 2: Clean text")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    t0 = time.time()
    input_files = []
    for root, dirs, files in os.walk(args.input_dir):
        for f in files:
            if f.endswith(".parquet"):
                input_files.append(os.path.join(root, f))

    if not input_files:
        print(f"No parquet files found in {args.input_dir}")
        return

    print(f"Found {len(input_files)} parquet shards to clean ({args.workers} workers)")

    tasks = []
    for input_path in input_files:
        rel_path = os.path.relpath(input_path, args.input_dir)
        output_path = os.path.join(args.output_dir, rel_path)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        tasks.append((input_path, output_path))

    all_stats = []
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(clean_shard, inp, out): inp for inp, out in tasks}
        done = 0
        for future in as_completed(futures):
            done += 1
            try:
                stats = future.result()
                all_stats.append(stats)
                if done % 20 == 0 or done == len(tasks):
                    print(f"  {done}/{len(tasks)} shards cleaned")
            except Exception as e:
                print(f"  FAILED {futures[future]}: {e}")

    total_rows = sum(s["rows"] for s in all_stats)
    total_empty = sum(s["empty_after_clean"] for s in all_stats)
    total_rtf = sum(s["rtf_artifacts_cleaned"] for s in all_stats)
    elapsed = time.time() - t0

    print(f"\nStage 2 complete in {elapsed/60:.1f} min")
    print(f"  Total rows: {total_rows:,}")
    print(f"  Empty after clean: {total_empty:,}")
    print(f"  RTF artifacts cleaned: {total_rtf:,}")

    with open(os.path.join(args.output_dir, "clean_stats.json"), "w") as f:
        json.dump({"total_rows": total_rows, "empty_after_clean": total_empty,
                    "rtf_artifacts_cleaned": total_rtf, "duration_sec": elapsed,
                    "shards": len(all_stats)}, f, indent=2)


if __name__ == "__main__":
    main()
