#!/usr/bin/env python3
"""
Upload Ukrainian court decisions dataset to HuggingFace Hub.

Supports multi-config upload (one config per epoch) with temporal splits.

Prerequisites:
    pip install huggingface_hub datasets pyarrow
    huggingface-cli login

Usage:
    python3 scripts/lextreme/upload-to-hf.py
    python3 scripts/lextreme/upload-to-hf.py --repo secondlayer/ukrainian-court-decisions
    python3 scripts/lextreme/upload-to-hf.py --epochs hybrid_war full_scale
"""

import argparse
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
DEFAULT_REPO = "secondlayer/ukrainian-court-decisions"
EPOCHS = ["pre_war", "hybrid_war", "full_scale"]


def main():
    parser = argparse.ArgumentParser(description="Upload dataset to HuggingFace Hub")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"HF repo ID (default: {DEFAULT_REPO})")
    parser.add_argument("--epochs", nargs="+", default=EPOCHS, choices=EPOCHS)
    parser.add_argument("--dry-run", action="store_true", help="Show what would be uploaded")
    args = parser.parse_args()

    try:
        from datasets import Dataset, DatasetDict
        from huggingface_hub import HfApi
    except ImportError:
        print("Install deps: pip install datasets huggingface_hub pyarrow")
        return

    configs = {}
    for epoch_name in args.epochs:
        epoch_dir = OUTPUT_DIR / epoch_name
        if not epoch_dir.exists():
            print(f"  Missing: {epoch_dir} -- run build-temporal-splits.py first")
            continue

        splits = {}
        for split_name in ["train", "validation", "test"]:
            path = epoch_dir / f"{split_name}.jsonl"
            if not path.exists():
                print(f"  Missing: {path}")
                continue
            splits[split_name] = Dataset.from_json(str(path))

        if splits:
            configs[epoch_name] = DatasetDict(splits)

    if not configs:
        print("No data found. Run extract-full-local.py then build-temporal-splits.py first.")
        return

    print(f"Dataset: {args.repo}")
    print(f"Configs: {list(configs.keys())}")
    for config_name, dataset_dict in configs.items():
        print(f"\n  {config_name}:")
        for split_name, ds in dataset_dict.items():
            print(f"    {split_name}: {len(ds):,} samples")
        print(f"    Columns: {dataset_dict['train'].column_names}")
        sample = dataset_dict["train"][0]
        print(f"    Example label: {sample['label']}")
        print(f"    Example text: {sample['text'][:100]}...")

    if args.dry_run:
        print(f"\nDry run -- not uploading.")
        return

    for config_name, dataset_dict in configs.items():
        print(f"\nUploading config '{config_name}' to {args.repo}...")
        dataset_dict.push_to_hub(
            args.repo,
            config_name=config_name,
            private=False,
        )
        print(f"  Done: {config_name}")

    print(f"\nhttps://huggingface.co/datasets/{args.repo}")


if __name__ == "__main__":
    main()
