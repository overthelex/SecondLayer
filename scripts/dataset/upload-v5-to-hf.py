#!/usr/bin/env python3
"""
Upload v5 case-outcome dataset to HuggingFace as a new config
in the existing overthelex/ukrainian-court-decisions repo.

Usage:
    python3 scripts/dataset/upload-v5-to-hf.py
    python3 scripts/dataset/upload-v5-to-hf.py --dry-run
"""

import argparse
from pathlib import Path

DATASET_DIR = Path(__file__).parent / "ua-case-outcome-hf"
REPO = "overthelex/ukrainian-court-decisions"
CONFIG_NAME = "case_outcome_temporal"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--repo", default=REPO)
    args = parser.parse_args()

    from huggingface_hub import HfApi

    api = HfApi()

    files_to_upload = [
        (DATASET_DIR / "train.parquet", f"{CONFIG_NAME}/train.parquet"),
        (DATASET_DIR / "validation.parquet", f"{CONFIG_NAME}/validation.parquet"),
        (DATASET_DIR / "test.parquet", f"{CONFIG_NAME}/test.parquet"),
    ]

    for local, remote in files_to_upload:
        size_mb = local.stat().st_size / 1024 / 1024
        print(f"  {remote} ({size_mb:.1f} MB)")

    if args.dry_run:
        print(f"\nDry run — not uploading to {args.repo}")
        return

    print(f"\nUploading to {args.repo} ...")
    for local, remote in files_to_upload:
        api.upload_file(
            path_or_fileobj=str(local),
            path_in_repo=remote,
            repo_id=args.repo,
            repo_type="dataset",
        )
        print(f"  uploaded {remote}")

    print(f"\nDone! https://huggingface.co/datasets/{args.repo}")
    print(f"Config: load_dataset('{args.repo}', '{CONFIG_NAME}')")


if __name__ == "__main__":
    main()
