#!/usr/bin/env python3
"""Download Danish court decisions from HuggingFace datasets.

Sources:
1. alexandrainst/domsdatabasen - ~3,917 Danish court decisions (~199 MB Parquet)
2. danish-foundation-models/danish-dynaword - domsdatabasen subset (8,470 rows)
"""

import json
import os
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from huggingface_hub import snapshot_download

BASE_DIR = Path("/home/ubuntu/opendata/denmark")
HF_DIR = BASE_DIR / "huggingface"

HF_DATASETS = {
    "domsdatabasen": "alexandrainst/domsdatabasen",
    "danish-dynaword": "danish-foundation-models/danish-dynaword",
}


def download_file(url: str, dest: Path, session: requests.Session = None):
    """Download a file with resume support and retry logic."""
    s = session or requests.Session()
    dest.parent.mkdir(parents=True, exist_ok=True)
    headers = {}
    mode = "wb"
    if dest.exists():
        existing = dest.stat().st_size
        headers["Range"] = f"bytes={existing}-"
        mode = "ab"
    for attempt in range(5):
        try:
            resp = s.get(url, headers=headers, stream=True, timeout=120)
            if resp.status_code == 416:
                return
            resp.raise_for_status()
            with open(dest, mode) as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
            return
        except Exception as e:
            if attempt < 4:
                wait = 2 ** attempt
                print(f"  Attempt {attempt+1} failed: {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise


def download_huggingface_domsdatabasen():
    """Download alexandrainst/domsdatabasen from HuggingFace."""
    repo_id = HF_DATASETS["domsdatabasen"]
    local_dir = HF_DIR / "domsdatabasen"
    print(f"\n{'='*60}")
    print(f"Downloading {repo_id} -> {local_dir}")
    print(f"Expected: ~3,917 decisions, ~199 MB Parquet")
    print(f"{'='*60}")
    t0 = time.time()
    try:
        snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            local_dir=str(local_dir),
            resume_download=True,
            max_workers=20,
        )
        elapsed = time.time() - t0
        size = sum(f.stat().st_size for f in local_dir.rglob("*") if f.is_file())
        print(f"Done: {repo_id} ({size / (1024**2):.1f} MB in {elapsed:.1f}s)")
    except Exception as e:
        print(f"ERROR downloading {repo_id}: {e}")
        raise


def download_huggingface_dynaword():
    """Download danish-foundation-models/danish-dynaword from HuggingFace."""
    repo_id = HF_DATASETS["danish-dynaword"]
    local_dir = HF_DIR / "danish-dynaword"
    print(f"\n{'='*60}")
    print(f"Downloading {repo_id} -> {local_dir}")
    print(f"Expected: ~8,470 rows (domsdatabasen subset)")
    print(f"{'='*60}")
    t0 = time.time()
    try:
        snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            local_dir=str(local_dir),
            resume_download=True,
            max_workers=20,
        )
        elapsed = time.time() - t0
        size = sum(f.stat().st_size for f in local_dir.rglob("*") if f.is_file())
        print(f"Done: {repo_id} ({size / (1024**2):.1f} MB in {elapsed:.1f}s)")
    except Exception as e:
        print(f"ERROR downloading {repo_id}: {e}")
        raise


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    HF_DIR.mkdir(parents=True, exist_ok=True)

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "hf"):
        download_huggingface_domsdatabasen()
        download_huggingface_dynaword()
    elif mode == "dynaword":
        download_huggingface_dynaword()

    print("\n" + "=" * 60)
    print("All Danish downloads complete!")
    total_size = sum(f.stat().st_size for f in BASE_DIR.rglob("*") if f.is_file())
    print(f"Total size: {total_size / (1024**3):.2f} GB")


if __name__ == "__main__":
    main()
