#!/usr/bin/env python3
"""
Download NIPO open data: trademarks and invention patents (2024-2026).
Two datasets run in parallel via separate processes.
Pages within each dataset fetched sequentially to avoid 429 rate limits.
"""

import calendar
import json
import math
import os
import sys
import time
from multiprocessing import Process, Queue
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

BASE_URL = "https://sis.nipo.gov.ua/api/v1/open-data/"
PAGE_SIZE = 10
MAX_RETRIES = 7
PAGE_DELAY = 0.15  # delay between sequential page requests


def log(msg):
    print(msg, flush=True)


def generate_months():
    """Generate (date_from, date_to) for Jan 2024 to Mar 2026."""
    months = []
    for y in range(2024, 2027):
        for m in range(1, 13):
            if (y, m) < (2024, 1) or (y, m) > (2026, 3):
                continue
            d_from = f"01.{m:02d}.{y}"
            if y == 2026 and m == 3:
                d_to = f"25.{m:02d}.{y}"
            else:
                last = calendar.monthrange(y, m)[1]
                d_to = f"{last:02d}.{m:02d}.{y}"
            months.append((d_from, d_to))
    return months


def fetch_json(url):
    """Fetch JSON with retries and exponential backoff."""
    for attempt in range(MAX_RETRIES):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (URLError, HTTPError, TimeoutError, ConnectionError, OSError) as e:
            wait = min(2 ** attempt + 1, 60)
            if "429" in str(e):
                wait = max(wait, 8)
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
            else:
                raise


def fetch_month_sequential(obj_type, date_from, date_to):
    """Fetch all pages for one month, one page at a time."""
    url = (
        f"{BASE_URL}?obj_state=2&obj_type={obj_type}"
        f"&reg_date_from={date_from}&reg_date_to={date_to}"
    )
    first = fetch_json(url)
    total = first["count"]
    if total == 0:
        return [], 0

    total_pages = math.ceil(total / PAGE_SIZE)
    all_results = list(first.get("results", []))

    for page in range(2, total_pages + 1):
        page_url = f"{url}&page={page}"
        try:
            data = fetch_json(page_url)
            all_results.extend(data.get("results", []))
        except Exception as e:
            log(f"    FAILED page {page}/{total_pages}: {e}")
        time.sleep(PAGE_DELAY)

    return all_results, total


def download_dataset(name, label, obj_type, output_path):
    """Download all data for a dataset, month by month, sequentially."""
    log(f"[{name}] Starting {label}...")

    months = generate_months()
    all_results = []
    total_api = 0

    for i, (d_from, d_to) in enumerate(months, 1):
        try:
            results, count = fetch_month_sequential(obj_type, d_from, d_to)
            all_results.extend(results)
            total_api += count
            log(f"[{name}] {i}/{len(months)} ({d_from}-{d_to}): +{len(results)} (total: {len(all_results)})")
        except Exception as e:
            log(f"[{name}] {d_from}-{d_to} FAILED: {e}")

    output_data = {
        "label": label,
        "obj_type": obj_type,
        "date_from": "01.01.2024",
        "date_to": "25.03.2026",
        "api_total_count": total_api,
        "downloaded_count": len(all_results),
        "results": all_results,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    log(f"[{name}] DONE: {len(all_results)} records, {size_mb:.1f} MB -> {output_path}")


if __name__ == "__main__":
    log("NIPO Open Data Downloader | 01.01.2024 - 25.03.2026")
    log("Running 2 datasets in parallel (separate processes)")
    start = time.time()

    datasets = [
        ("Trademarks", "Торговельні марки", 4,
         "/home/vovkes/SecondLayer/scripts/opendata/nipo/trademarks_2024_2026.json"),
        ("Patents", "Патенти на винаходи", 1,
         "/home/vovkes/SecondLayer/scripts/opendata/nipo/patents_inventions_2024_2026.json"),
    ]

    procs = []
    for name, label, obj_type, output in datasets:
        p = Process(target=download_dataset, args=(name, label, obj_type, output))
        p.start()
        procs.append((name, p))

    for name, p in procs:
        p.join()
        if p.exitcode == 0:
            log(f"[{name}] Process completed successfully")
        else:
            log(f"[{name}] Process exited with code {p.exitcode}")

    elapsed = time.time() - start
    log(f"\nAll downloads complete in {elapsed:.0f}s")

    # Summary
    for name, label, obj_type, path in datasets:
        if os.path.exists(path):
            size_mb = os.path.getsize(path) / (1024 * 1024)
            with open(path, "r") as f:
                data = json.load(f)
            log(f"  {name}: {data['downloaded_count']} records, {size_mb:.1f} MB")
        else:
            log(f"  {name}: FILE NOT FOUND")
