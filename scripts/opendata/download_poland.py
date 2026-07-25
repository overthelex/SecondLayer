#!/usr/bin/env python3
"""Download Polish court decisions: JuDDGES HuggingFace + SAOS API."""

import json
import os
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from huggingface_hub import snapshot_download

BASE_DIR = Path("/home/ubuntu/opendata/poland")
SAOS_DIR = BASE_DIR / "saos-api"
HF_DIR = BASE_DIR / "huggingface"

SAOS_API = "https://www.saos.org.pl/api/dump/judgments"
SAOS_PAGE_SIZE = 100

HF_DATASETS = [
    "JuDDGES/pl-court-raw",
    "JuDDGES/pl-nsa",
]


def download_huggingface():
    """Download JuDDGES datasets from HuggingFace."""
    for repo_id in HF_DATASETS:
        name = repo_id.split("/")[1]
        local_dir = HF_DIR / name
        print(f"\n{'='*60}")
        print(f"Downloading {repo_id} -> {local_dir}")
        print(f"{'='*60}")
        try:
            snapshot_download(
                repo_id=repo_id,
                repo_type="dataset",
                local_dir=str(local_dir),
                resume_download=True,
                max_workers=20,
            )
            print(f"Done: {repo_id}")
        except Exception as e:
            print(f"ERROR downloading {repo_id}: {e}")
            raise


def download_saos_page(page_num: int, session: requests.Session) -> dict:
    """Download a single page from SAOS API."""
    params = {"pageSize": SAOS_PAGE_SIZE, "pageNumber": page_num}
    for attempt in range(5):
        try:
            resp = session.get(SAOS_API, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < 4:
                wait = 2 ** attempt
                print(f"  Page {page_num} attempt {attempt+1} failed: {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise


def get_saos_total(session: requests.Session) -> int:
    """Get total judgment count from search endpoint."""
    resp = session.get(
        "https://www.saos.org.pl/api/search/judgments",
        params={"pageSize": 10, "pageNumber": 0},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["info"]["totalResults"]


def download_saos():
    """Download all judgments from SAOS API with parallel workers."""
    SAOS_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint_file = SAOS_DIR / "checkpoint.json"

    start_page = 0
    if checkpoint_file.exists():
        with open(checkpoint_file) as f:
            checkpoint = json.load(f)
            start_page = checkpoint.get("last_completed_page", -1) + 1
            print(f"Resuming from page {start_page}")

    session = requests.Session()
    session.headers["Accept"] = "application/json"

    total_items = get_saos_total(session)
    total_pages = (total_items + SAOS_PAGE_SIZE - 1) // SAOS_PAGE_SIZE
    print(f"\nSAOS API: {total_items} judgments, {total_pages} pages")

    batch_size = 20
    saved = start_page * SAOS_PAGE_SIZE
    t0 = time.time()

    for batch_start in range(start_page, total_pages, batch_size):
        batch_end = min(batch_start + batch_size, total_pages)
        pages_in_batch = list(range(batch_start, batch_end))

        with ThreadPoolExecutor(max_workers=batch_size) as pool:
            futures = {
                pool.submit(download_saos_page, p, session): p
                for p in pages_in_batch
            }
            for future in as_completed(futures):
                page_num = futures[future]
                try:
                    data = future.result()
                    page_file = SAOS_DIR / f"page_{page_num:05d}.json"
                    with open(page_file, "w") as f:
                        json.dump(data, f, ensure_ascii=False)
                    saved += len(data.get("items", []))
                except Exception as e:
                    print(f"FAILED page {page_num}: {e}")

        with open(checkpoint_file, "w") as f:
            json.dump({"last_completed_page": batch_end - 1, "total_pages": total_pages}, f)

        elapsed = time.time() - t0
        rate = saved / elapsed if elapsed > 0 else 0
        pct = saved / total_items * 100
        print(f"  Pages {batch_start}-{batch_end-1} done | {saved}/{total_items} ({pct:.1f}%) | {rate:.0f} items/s")

    print(f"\nSAOS download complete: {saved} judgments in {SAOS_DIR}")


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    HF_DIR.mkdir(parents=True, exist_ok=True)

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "hf"):
        download_huggingface()
    if mode in ("all", "saos"):
        download_saos()

    print("\n" + "="*60)
    print("All downloads complete!")
    total_size = sum(f.stat().st_size for f in BASE_DIR.rglob("*") if f.is_file())
    print(f"Total size: {total_size / (1024**3):.1f} GB")


if __name__ == "__main__":
    main()
