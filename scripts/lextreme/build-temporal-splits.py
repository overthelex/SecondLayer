#!/usr/bin/env python3
"""
Build HuggingFace dataset with temporal train/val/test splits per epoch.

Takes per-epoch JSONL files from extract-full-local.py, sorts by adjudication_date,
and splits chronologically: earliest 80% = train, next 10% = validation, last 10% = test.

Produces three configs for HuggingFace (one per epoch):
  - pre_war    (2008-2013)
  - hybrid_war (2014-2021)
  - full_scale (2022-2026)

Usage:
    python3 scripts/lextreme/build-temporal-splits.py
    python3 scripts/lextreme/build-temporal-splits.py --balance 20000
    python3 scripts/lextreme/build-temporal-splits.py --epochs hybrid_war full_scale
"""

import argparse
import json
import random
from collections import Counter
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
SEED = 42
TRAIN_RATIO = 0.8
VAL_RATIO = 0.1

EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
LABELS = ["approved", "dismissed", "partial"]


def load_epoch(epoch_name):
    path = OUTPUT_DIR / f"lextreme-ukr-{epoch_name}.jsonl"
    if not path.exists():
        print(f"  Missing: {path}")
        return []
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            records.append(json.loads(line))
    return records


def temporal_split(records):
    records.sort(key=lambda r: r.get("adjudication_date") or "")

    n = len(records)
    train_end = int(n * TRAIN_RATIO)
    val_end = train_end + int(n * VAL_RATIO)

    train = records[:train_end]
    val = records[train_end:val_end]
    test = records[val_end:]

    return {"train": train, "validation": val, "test": test}


def balance_per_class(records, target_per_class, rng):
    by_label = {}
    for r in records:
        by_label.setdefault(r["label"], []).append(r)

    balanced = []
    for label in sorted(by_label.keys()):
        items = by_label[label]
        rng.shuffle(items)
        n = min(len(items), target_per_class)
        balanced.extend(items[:n])

    balanced.sort(key=lambda r: r.get("adjudication_date") or "")
    return balanced


def format_for_hf(record):
    return {
        "text": record["text"],
        "label": record["label"],
        "language": record["language"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", nargs="+", default=EPOCHS, choices=EPOCHS)
    parser.add_argument("--balance", type=int, default=None,
                        help="Balance to N per class per epoch before splitting")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--keep-metadata", action="store_true",
                        help="Keep jurisdiction, adjudication_date, doc_id in output")
    args = parser.parse_args()

    rng = random.Random(args.seed)

    print("Building temporal splits for LexTreme")
    print(f"Epochs: {args.epochs}")
    if args.balance:
        print(f"Balancing to {args.balance} per class per epoch")
    print()

    for epoch_name in args.epochs:
        print(f"{'='*50}")
        print(f"Config: {epoch_name}")

        records = load_epoch(epoch_name)
        if not records:
            continue

        dist = Counter(r["label"] for r in records)
        print(f"  Raw: {len(records):,} samples  {dict(dist)}")

        if args.balance:
            records = balance_per_class(records, args.balance, rng)
            dist = Counter(r["label"] for r in records)
            print(f"  Balanced: {len(records):,} samples  {dict(dist)}")

        splits = temporal_split(records)

        epoch_dir = OUTPUT_DIR / epoch_name
        epoch_dir.mkdir(parents=True, exist_ok=True)

        for split_name, split_data in splits.items():
            dates = [r["adjudication_date"] for r in split_data if r.get("adjudication_date")]
            date_range = f"{min(dates)} .. {max(dates)}" if dates else "no dates"
            dist = Counter(r["label"] for r in split_data)

            path = epoch_dir / f"{split_name}.jsonl"
            with open(path, "w", encoding="utf-8") as f:
                for record in split_data:
                    out = record if args.keep_metadata else format_for_hf(record)
                    f.write(json.dumps(out, ensure_ascii=False) + "\n")

            print(f"  {split_name:12s}: {len(split_data):>7,} samples  [{date_range}]  {dict(dist)}")

    print(f"\n{'='*50}")
    print("Output structure:")
    for epoch_name in args.epochs:
        epoch_dir = OUTPUT_DIR / epoch_name
        if epoch_dir.exists():
            for f in sorted(epoch_dir.glob("*.jsonl")):
                print(f"  {f.relative_to(OUTPUT_DIR)}")

    print("\nRun upload-to-hf.py to push to HuggingFace.")


if __name__ == "__main__":
    main()
