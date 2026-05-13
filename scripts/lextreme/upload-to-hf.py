#!/usr/bin/env python3
"""
Upload the extracted Ukrainian court decisions dataset to HuggingFace Hub.

Prerequisites:
    pip install huggingface_hub datasets pyarrow
    huggingface-cli login

Usage:
    python3 scripts/lextreme/upload-to-hf.py
    python3 scripts/lextreme/upload-to-hf.py --repo secondlayer/ukrainian-court-decisions
"""

import argparse
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
DEFAULT_REPO = "secondlayer/ukrainian-court-decisions"


def main():
    parser = argparse.ArgumentParser(description="Upload dataset to HuggingFace Hub")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"HF repo ID (default: {DEFAULT_REPO})")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be uploaded without uploading")
    args = parser.parse_args()

    try:
        from datasets import Dataset, DatasetDict
    except ImportError:
        print("❌ datasets not installed. Run: pip install datasets huggingface_hub pyarrow")
        return

    splits = {}
    for split_name in ["train", "validation", "test"]:
        candidates = [
            OUTPUT_DIR / f"{split_name}.parquet",
            OUTPUT_DIR / f"{split_name}.jsonl",
            OUTPUT_DIR / f"lextreme-ukr-{split_name}.jsonl",
        ]

        found = None
        for path in candidates:
            if path.exists():
                found = path
                break

        if not found:
            print(f"❌ Не знайдено файл для {split_name}: шукав {[str(c) for c in candidates]}")
            return

        if found.suffix == ".parquet":
            splits[split_name] = Dataset.from_parquet(str(found))
        else:
            splits[split_name] = Dataset.from_json(str(found))

    dataset_dict = DatasetDict(splits)

    print(f"📊 Датасет:")
    for name, ds in dataset_dict.items():
        print(f"  {name}: {len(ds):,} записів")

    print(f"\n  Колонки: {dataset_dict['train'].column_names}")
    print(f"  Приклад:")
    sample = dataset_dict["train"][0]
    print(f"    label: {sample['label']}")
    print(f"    language: {sample['language']}")
    print(f"    text: {sample['text'][:200]}...")

    if args.dry_run:
        print(f"\n🔍 Dry run — не завантажую. Репо: {args.repo}")
        return

    print(f"\n⬆️  Завантаження на HuggingFace: {args.repo}")
    dataset_dict.push_to_hub(
        args.repo,
        private=False,
    )
    print(f"✅ Готово! https://huggingface.co/datasets/{args.repo}")


if __name__ == "__main__":
    main()
