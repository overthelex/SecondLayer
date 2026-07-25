#!/usr/bin/env python3
"""
Pooled retrieval corpus for the EVAL-500K benchmark (BEIR-style), to cut
embedding time on Brev.

Pool = queries ∪ all graded candidates ∪ same-case exclusions (must be
embedded so they can be filtered out of rankings at eval time) + stratified
distractors from the rest of EVAL-500K, proportional to (year, kind) cells,
up to --target docs total.

Model ranking (RQ1) is unaffected by pool size; absolute metric values are
reported as pooled-corpus numbers in the paper.

Inputs:  output/eval500k/{sample.csv, qrels.txt, excluded.txt}
         output/eval500k/texts_stripped/   (from 12_sample_eval500k.py --export-text)
Outputs: output/eval500k/pool.csv
         output/eval500k/pool_manifest.json
         output/eval500k/texts_pool/       (filtered jsonl shards)

Usage:
  python3 14_build_relevant_pool.py                 # default target 100K
  python3 14_build_relevant_pool.py --target 150000
"""

import argparse
import csv
import json
import logging
import random
from collections import defaultdict
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("pool")

OUTPUT_DIR = Path(__file__).parent / "output" / "eval500k"
SEED = 42


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target", type=int, default=100_000)
    ap.add_argument("--texts-dir", default=str(OUTPUT_DIR / "texts_stripped"))
    ap.add_argument("--out-texts-dir", default=str(OUTPUT_DIR / "texts_pool"))
    ap.add_argument("--skip-texts", action="store_true", help="only build pool.csv")
    args = ap.parse_args()

    rng = random.Random(SEED)

    core = set()
    with open(OUTPUT_DIR / "qrels.txt") as f:
        for line in f:
            q, _, d, _ = line.split()
            core.add(int(q))
            core.add(int(d))
    with open(OUTPUT_DIR / "excluded.txt") as f:
        for line in f:
            _, d = line.split()
            core.add(int(d))
    log.info("core (queries + graded + same-case): %d docs", len(core))

    with open(OUTPUT_DIR / "sample.csv") as f:
        sample = list(csv.DictReader(f))
    by_id = {int(r["doc_id"]): r for r in sample}
    missing = core - set(by_id)
    if missing:
        raise SystemExit(f"{len(missing)} core docs not in sample.csv - qrels/sample mismatch")

    n_distractors = max(0, args.target - len(core))
    cells = defaultdict(list)
    for r in sample:
        d = int(r["doc_id"])
        if d not in core:
            cells[(r["adj_year"], r["justice_kind"])].append(d)
    total_rest = sum(len(v) for v in cells.values())
    distractors = set()
    for cell, pool in sorted(cells.items()):
        take = min(len(pool), round(n_distractors * len(pool) / total_rest))
        distractors.update(rng.sample(pool, take))
    log.info("distractors: %d (stratified over %d cells)", len(distractors), len(cells))

    pool = core | distractors
    fieldnames = list(sample[0].keys()) + ["in_core"]
    with open(OUTPUT_DIR / "pool.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for d in sorted(pool):
            w.writerow({**by_id[d], "in_core": int(d in core)})

    comp = defaultdict(int)
    for d in pool:
        comp[by_id[d]["adj_year"]] += 1
    json.dump({
        "target": args.target, "seed": SEED,
        "pool_size": len(pool), "core": len(core), "distractors": len(distractors),
        "by_year": dict(sorted(comp.items())),
    }, open(OUTPUT_DIR / "pool_manifest.json", "w"), indent=2)
    log.info("pool.csv: %d docs (%.1fx reduction vs %d)",
             len(pool), len(sample) / len(pool), len(sample))

    if args.skip_texts:
        return

    out_dir = Path(args.out_texts_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    kept = 0
    for shard in sorted(Path(args.texts_dir).glob("texts-*.jsonl")):
        out_lines = []
        with open(shard, encoding="utf-8") as f:
            for line in f:
                # avoid full json parse: doc_id is the first key
                doc_id = int(line[line.index(":") + 1: line.index(",")])
                if doc_id in pool:
                    out_lines.append(line)
        if out_lines:
            with open(out_dir / shard.name, "w", encoding="utf-8") as f:
                f.writelines(out_lines)
            kept += len(out_lines)
    if kept != len(pool):
        log.warning("texts: %d written != pool %d", kept, len(pool))
    else:
        log.info("texts: %d docs -> %s", kept, out_dir)


if __name__ == "__main__":
    main()
