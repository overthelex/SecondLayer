#!/usr/bin/env python3
"""Reshard cleaned KUpAP dataset into N equal plain JSONL shards for embedding.

Filters judgment_code to {2: постанова, 5: ухвала, 6: окрема ухвала}.
Stage A (parallel per input file): decompress, filter, round-robin lines into
per-input part files. Stage B (parallel per shard): concatenate parts.
"""
import json
import os
import shutil
import subprocess
import sys
import time
from multiprocessing import Pool
from pathlib import Path

if len(sys.argv) < 3:
    sys.exit('usage: reshard_filtered.py <src_dir> <out_dir> [keep_judgment_codes=2,5,6] [num_shards=32]')
SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
PARTS = OUT / '.parts'
KEEP_CODES = set(int(c) for c in (sys.argv[3] if len(sys.argv) > 3 else '2,5,6').split(','))
NUM_SHARDS = int(sys.argv[4]) if len(sys.argv) > 4 else 32


def stage_a(src_str):
    src = Path(src_str)
    outs = [open(PARTS / f'{src.name}.part_{i:02d}', 'wb') for i in range(NUM_SHARDS)]
    dec = subprocess.Popen(['zstd', '-dc', str(src)], stdout=subprocess.PIPE)
    kept = 0
    dropped = 0
    for line in dec.stdout:
        d = json.loads(line)
        if d.get('judgment_code') not in KEEP_CODES:
            dropped += 1
            continue
        outs[kept % NUM_SHARDS].write(line)
        kept += 1
    dec.stdout.close()
    if dec.wait() != 0:
        raise RuntimeError(f'zstd failed: {src}')
    for f in outs:
        f.close()
    print(f'  [A] {src.name}: kept {kept}, dropped {dropped}', flush=True)
    return kept, dropped


def stage_b(shard_idx):
    out_path = OUT / f'docs_{shard_idx:02d}.jsonl'
    part_files = sorted(PARTS.glob(f'*.part_{shard_idx:02d}'))
    n = 0
    with open(out_path, 'wb') as out:
        for pf in part_files:
            with open(pf, 'rb') as f:
                shutil.copyfileobj(f, out, 1024 * 1024 * 8)
            os.remove(pf)
    r = subprocess.run(['wc', '-l', str(out_path)], capture_output=True, text=True)
    n = int(r.stdout.split()[0])
    print(f'  [B] docs_{shard_idx:02d}.jsonl: {n} docs, {out_path.stat().st_size/1e9:.2f} GB', flush=True)
    return n


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PARTS.mkdir(exist_ok=True)
    files = sorted(SRC.glob('*.jsonl.zst'))
    print(f'Stage A: filtering+splitting {len(files)} files -> {NUM_SHARDS} shards', flush=True)
    t0 = time.time()
    with Pool(len(files)) as pool:
        res = pool.map(stage_a, [str(f) for f in files])
    kept = sum(r[0] for r in res)
    dropped = sum(r[1] for r in res)
    print(f'Stage A done in {time.time()-t0:.0f}s: kept {kept}, dropped {dropped}', flush=True)

    print('Stage B: concatenating parts...', flush=True)
    t0 = time.time()
    with Pool(NUM_SHARDS) as pool:
        counts = pool.map(stage_b, range(NUM_SHARDS))
    print(f'Stage B done in {time.time()-t0:.0f}s', flush=True)
    PARTS.rmdir()
    print(f'Shard totals: min={min(counts)}, max={max(counts)}, sum={sum(counts)}', flush=True)
    assert sum(counts) == kept, 'shard sum mismatch!'
    print('DONE', flush=True)


if __name__ == '__main__':
    main()
