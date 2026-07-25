#!/usr/bin/env python3
"""
Stratified sampling of EDRSR cases for judge-guided DPO experiment.

Samples 1000 cases per epoch (3000 total), balanced by label,
filtered by text length (2K-12K chars) for optimal LLM context usage.

Uses the full dataset (output-full/) which includes metadata:
doc_id, adjudication_date, jurisdiction.
"""

import json
import random
import argparse
from pathlib import Path
from collections import defaultdict

EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
LABELS = ["approved", "dismissed", "partial"]
DATA_DIR = Path(__file__).parent / "output-full"
OUTPUT_DIR = Path(__file__).parent / "dpo-judge"

MIN_TEXT_LEN = 2000
MAX_TEXT_LEN = 12000
SAMPLES_PER_LABEL_PER_EPOCH = 334  # ~1000 per epoch, ~3000 total


def load_epoch(epoch: str) -> list[dict]:
    path = DATA_DIR / epoch / "train.jsonl"
    cases = []
    with open(path) as f:
        for line in f:
            d = json.loads(line)
            text_len = len(d["text"])
            if MIN_TEXT_LEN <= text_len <= MAX_TEXT_LEN:
                d["epoch"] = epoch
                d["text_len"] = text_len
                cases.append(d)
    return cases


def stratified_sample(cases: list[dict], per_label: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    by_label = defaultdict(list)
    for c in cases:
        by_label[c["label"]].append(c)

    sampled = []
    for label in LABELS:
        pool = by_label[label]
        n = min(per_label, len(pool))
        sampled.extend(rng.sample(pool, n))
        print(f"    {label}: {n}/{len(pool)} sampled")

    rng.shuffle(sampled)
    return sampled


def main():
    parser = argparse.ArgumentParser(description="Sample EDRSR cases for DPO judge experiment")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--per-label", type=int, default=SAMPLES_PER_LABEL_PER_EPOCH)
    parser.add_argument("--min-len", type=int, default=MIN_TEXT_LEN)
    parser.add_argument("--max-len", type=int, default=MAX_TEXT_LEN)
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_sampled = []

    for epoch in EPOCHS:
        print(f"\n{epoch}:")
        cases = load_epoch(epoch)
        print(f"  {len(cases)} cases in range [{args.min_len}, {args.max_len}] chars")

        sampled = stratified_sample(cases, args.per_label, args.seed)
        all_sampled.extend(sampled)
        print(f"  → {len(sampled)} sampled")

    output_path = OUTPUT_DIR / "sampled_cases.jsonl"
    with open(output_path, "w") as f:
        for case in all_sampled:
            f.write(json.dumps(case, ensure_ascii=False) + "\n")

    stats = {
        "total": len(all_sampled),
        "per_epoch": {e: sum(1 for c in all_sampled if c["epoch"] == e) for e in EPOCHS},
        "per_label": {l: sum(1 for c in all_sampled if c["label"] == l) for l in LABELS},
        "text_len": {
            "min": min(c["text_len"] for c in all_sampled),
            "max": max(c["text_len"] for c in all_sampled),
            "median": sorted(c["text_len"] for c in all_sampled)[len(all_sampled) // 2],
        },
        "seed": args.seed,
        "min_text_len": args.min_len,
        "max_text_len": args.max_len,
    }

    stats_path = OUTPUT_DIR / "sampling_stats.json"
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Total sampled: {len(all_sampled)}")
    print(f"Output: {output_path}")
    print(f"Stats:  {stats_path}")
    print(json.dumps(stats, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
