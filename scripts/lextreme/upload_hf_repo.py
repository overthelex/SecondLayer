#!/usr/bin/env python3
"""
Upload temporal drift dataset to overthelex/ua-temporal-drift on HuggingFace.

Rebuilds splits from raw epoch files to preserve full metadata
(adjudication_date, doc_id, jurisdiction).

Usage:
    python3 scripts/lextreme/upload_hf_repo.py
    python3 scripts/lextreme/upload_hf_repo.py --dry-run
"""

import argparse
import json
from pathlib import Path

from datasets import Dataset, DatasetDict, Features, Value, ClassLabel
from huggingface_hub import HfApi

REPO_ID = "overthelex/ua-temporal-drift"
OUTPUT_DIR = Path(__file__).parent / "output"
EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
LABELS = ["approved", "dismissed", "partial"]
TRAIN_RATIO = 0.8
VAL_RATIO = 0.1


def load_raw_epoch(epoch):
    path = OUTPUT_DIR / f"lextreme-ukr-{epoch}.jsonl"
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            r["epoch"] = epoch
            records.append(r)
    records.sort(key=lambda r: r.get("adjudication_date") or "")
    return records


def temporal_split(records):
    n = len(records)
    train_end = int(n * TRAIN_RATIO)
    val_end = train_end + int(n * VAL_RATIO)
    return {
        "train": records[:train_end],
        "validation": records[train_end:val_end],
        "test": records[val_end:],
    }


def records_to_dataset(records):
    return Dataset.from_dict({
        "text": [r["text"] for r in records],
        "label": [r["label"] for r in records],
        "epoch": [r["epoch"] for r in records],
        "adjudication_date": [r.get("adjudication_date", "") for r in records],
        "jurisdiction": [r.get("jurisdiction", "") for r in records],
        "doc_id": [r.get("doc_id", "") for r in records],
        "language": [r.get("language", "uk") for r in records],
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api = HfApi()

    configs = {}

    for epoch in EPOCHS:
        print(f"Loading {epoch}...")
        records = load_raw_epoch(epoch)
        splits = temporal_split(records)

        for split_name, split_records in splits.items():
            print(f"  {split_name}: {len(split_records):,} records")

        configs[epoch] = DatasetDict({
            split_name: records_to_dataset(split_records)
            for split_name, split_records in splits.items()
        })

    print(f"\nLoading combined (all epochs)...")
    all_records = []
    for epoch in EPOCHS:
        all_records.extend(load_raw_epoch(epoch))
    all_records.sort(key=lambda r: r.get("adjudication_date") or "")
    all_splits = temporal_split(all_records)

    configs["all"] = DatasetDict({
        split_name: records_to_dataset(split_records)
        for split_name, split_records in all_splits.items()
    })
    for split_name, split_records in all_splits.items():
        print(f"  {split_name}: {len(split_records):,} records")

    if args.dry_run:
        print("\n[DRY-RUN] Would upload to:", REPO_ID)
        for config_name, dd in configs.items():
            for split_name, ds in dd.items():
                print(f"  {config_name}/{split_name}: {len(ds):,} rows, "
                      f"cols={ds.column_names}")
        return

    for config_name, dd in configs.items():
        print(f"\nUploading config: {config_name}")
        dd.push_to_hub(
            REPO_ID,
            config_name=config_name,
            private=False,
        )
        print(f"  Done: {config_name}")

    print(f"\nAll configs uploaded to https://huggingface.co/datasets/{REPO_ID}")


if __name__ == "__main__":
    main()
