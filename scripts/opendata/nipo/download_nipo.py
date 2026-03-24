#!/usr/bin/env python3
"""
Download NIPO open data: trademarks and invention patents (2024-2026).
Fetches all pages with controlled concurrency to avoid 429 rate limits.
Runs both datasets simultaneously (2 parallel threads).
"""

import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

BASE_URL = "https://sis.nipo.gov.ua/api/v1/open-data/"
DATE_FROM = "01.01.2024"
DATE_TO = "25.03.2026"
PAGE_SIZE = 10
MAX_WORKERS = 3  # concurrent requests per dataset (conservative to avoid 429)
MAX_RETRIES = 7
BATCH_DELAY = 0.5  # seconds between batches

DATASETS = [
    {
        "name": "Trademarks",
        "label": "Торговельні марки",
        "obj_type": 4,
        "output": "/home/vovkes/SecondLayer/scripts/opendata/nipo/trademarks_2024_2026.json",
    },
    {
        "name": "Patents",
        "label": "Патенти на винаходи",
        "obj_type": 1,
        "output": "/home/vovkes/SecondLayer/scripts/opendata/nipo/patents_inventions_2024_2026.json",
    },
]


def log(msg):
    print(msg, flush=True)


def fetch_page(obj_type: int, page: int) -> list:
    """Fetch a single page with retries and backoff."""
    url = (
        f"{BASE_URL}?obj_state=2&obj_type={obj_type}"
        f"&reg_date_from={DATE_FROM}&reg_date_to={DATE_TO}&page={page}"
    )
    for attempt in range(MAX_RETRIES):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("results", [])
        except (URLError, HTTPError, TimeoutError, ConnectionError) as e:
            wait = min(2 ** attempt + 1, 60)
            if "429" in str(e):
                wait = max(wait, 10)
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
            else:
                log(f"  FAILED page {page} (obj_type={obj_type}) after {MAX_RETRIES} attempts: {e}")
                return []


def fetch_first_page(obj_type: int):
    """Fetch page 1 with retries to get total count."""
    url = (
        f"{BASE_URL}?obj_state=2&obj_type={obj_type}"
        f"&reg_date_from={DATE_FROM}&reg_date_to={DATE_TO}"
    )
    for attempt in range(MAX_RETRIES):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (URLError, HTTPError, TimeoutError, ConnectionError) as e:
            wait = min(2 ** attempt + 1, 30)
            if "429" in str(e):
                wait = max(wait, 10)
            if attempt < MAX_RETRIES - 1:
                log(f"  First page attempt {attempt+1} failed: {e}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


def download_dataset(dataset: dict):
    """Download all pages for a dataset."""
    name = dataset["name"]
    label = dataset["label"]
    obj_type = dataset["obj_type"]
    output_path = dataset["output"]

    log(f"[{name}] Starting {label}...")

    first = fetch_first_page(obj_type)
    total = first["count"]
    total_pages = math.ceil(total / PAGE_SIZE)
    all_results = list(first.get("results", []))

    log(f"[{name}] Total: {total} records across {total_pages} pages")

    if total_pages > 1:
        pages_to_fetch = list(range(2, total_pages + 1))
        done = 1

        # Process in batches of MAX_WORKERS
        for batch_start in range(0, len(pages_to_fetch), MAX_WORKERS):
            batch = pages_to_fetch[batch_start:batch_start + MAX_WORKERS]
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
                futures = {pool.submit(fetch_page, obj_type, p): p for p in batch}
                for future in as_completed(futures):
                    results = future.result()
                    all_results.extend(results)
                    done += 1

            if done % 50 == 0 or done == total_pages:
                log(f"[{name}] {done}/{total_pages} pages ({len(all_results)} records)")

            time.sleep(BATCH_DELAY)

    output_data = {
        "count": total,
        "obj_type": obj_type,
        "label": label,
        "date_from": DATE_FROM,
        "date_to": DATE_TO,
        "downloaded_count": len(all_results),
        "results": all_results,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    log(f"[{name}] DONE: {len(all_results)} records, {size_mb:.1f} MB -> {output_path}")
    return len(all_results)


if __name__ == "__main__":
    log(f"NIPO Open Data Downloader | {DATE_FROM} - {DATE_TO}")
    start = time.time()

    # Run both datasets in parallel (2 threads)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(download_dataset, ds): ds["name"] for ds in DATASETS}
        for future in as_completed(futures):
            name = futures[future]
            try:
                count = future.result()
                log(f"[{name}] Complete: {count} records")
            except Exception as e:
                log(f"[{name}] FAILED: {e}")

    elapsed = time.time() - start
    log(f"\nAll downloads complete in {elapsed:.0f}s")
