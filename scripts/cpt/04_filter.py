#!/usr/bin/env python3
"""Stage 4: Filter low-quality documents."""

import argparse, json, os, re, sys, time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).parent))
from utils.text_cleaning import has_excessive_repetition

MIN_LEN, MAX_LEN = 500, 500_000
RE_POSTPONE = re.compile(r'відкласти\s+розгляд|перенести\s+слухання|відкладення|оголосити\s+перерву|призначити\s+до\s+розгляду|залишити\s+без\s+руху', re.I)
RE_PLACEHOLDER = re.compile(r'[Тт]екст\s+не\s+знайдено|[Дд]окумент\s+не\s+знайдено|[Іі]нформація\s+відсутня|[Тт]екст\s+відсутній', re.I)


def filter_shard(input_path, output_path):
    table = pq.read_table(input_path)
    n = table.num_rows
    if n == 0:
        pq.write_table(table, output_path, compression="zstd")
        return {"shard": os.path.basename(input_path), "input": 0, "output": 0, "filters": {}}

    texts = table.column("full_text").to_pylist()
    lengths = table.column("text_length").to_pylist() if "text_length" in table.column_names else [len(t or "") for t in texts]
    jcodes = table.column("judgment_code").to_pylist() if "judgment_code" in table.column_names else [0]*n
    filters = {"too_short": 0, "too_long": 0, "postponement": 0, "repetition": 0, "placeholder": 0}
    mask = []
    for text, tl, jc in zip(texts, lengths, jcodes):
        keep = True
        if not text or tl < MIN_LEN: filters["too_short"] += 1; keep = False
        elif tl > MAX_LEN: filters["too_long"] += 1; keep = False
        elif RE_PLACEHOLDER.search(text[:500]): filters["placeholder"] += 1; keep = False
        elif jc == 4 and tl < 2000 and RE_POSTPONE.search(text): filters["postponement"] += 1; keep = False
        elif has_excessive_repetition(text): filters["repetition"] += 1; keep = False
        mask.append(keep)

    filtered = table.filter(pa.array(mask))
    pq.write_table(filtered, output_path, compression="zstd")
    return {"shard": os.path.basename(input_path), "input": n, "output": filtered.num_rows,
            "removed": n - filtered.num_rows, "filters": filters}


def main():
    parser = argparse.ArgumentParser(description="Stage 4: Filter")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    t0 = time.time()

    input_files = [os.path.join(r, f) for r, d, fs in os.walk(args.input_dir) for f in fs if f.endswith(".parquet")]
    print(f"Filtering {len(input_files)} shards")
    tasks = []
    for ip in input_files:
        op = os.path.join(args.output_dir, os.path.relpath(ip, args.input_dir))
        os.makedirs(os.path.dirname(op), exist_ok=True)
        tasks.append((ip, op))

    all_stats = []
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(filter_shard, i, o): i for i, o in tasks}
        done = 0
        for future in as_completed(futures):
            done += 1
            try:
                all_stats.append(future.result())
                if done % 20 == 0: print(f"  {done}/{len(tasks)} filtered")
            except Exception as e: print(f"  FAILED: {e}")

    ti = sum(s["input"] for s in all_stats)
    to = sum(s["output"] for s in all_stats)
    af = {}
    for s in all_stats:
        for k, v in s["filters"].items(): af[k] = af.get(k, 0) + v
    elapsed = time.time() - t0
    print(f"\nStage 4 complete in {elapsed/60:.1f} min\n  Input: {ti:,}\n  Output: {to:,}\n  Removed: {ti-to:,} ({(ti-to)/max(ti,1)*100:.1f}%)")
    for k, v in sorted(af.items(), key=lambda x: -x[1]): print(f"    {k}: {v:,}")
    with open(os.path.join(args.output_dir, "filter_stats.json"), "w") as f:
        json.dump({"total_input": ti, "total_output": to, "filters": af, "duration_sec": elapsed}, f, indent=2)

if __name__ == "__main__":
    main()
