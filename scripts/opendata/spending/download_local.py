#!/usr/bin/env python3
"""
Local download of peny/addendums/acts from spending.gov.ua API.
No IP binding - uses default network interface.

Usage:
    python3 download_local.py --type peny
    python3 download_local.py --type addendums
    python3 download_local.py --type peny --from 2024-01-01
    python3 download_local.py --type all --resume
"""

import argparse
import json
import os
import sys
import time
import logging
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

API_BASE = "https://api.spending.gov.ua/api/v2/disposers"
MAX_RETRIES = 5
RETRY_DELAY = 2
TIMEOUT = 60
OUTPUT_DIR = "./data"
DOC_TYPES = ["peny", "addendums", "acts"]
MAX_DOCS = 950

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("spending_local.log"),
    ],
)
log = logging.getLogger(__name__)

stats = {"downloaded": 0, "skipped": 0, "failed": 0, "documents": 0, "truncated": 0, "requests": 0}
stats_lock = Lock()


def fetch_json(url, label=""):
    for attempt in range(MAX_RETRIES):
        try:
            with stats_lock:
                stats["requests"] += 1
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "SecondLayer-OpenData/1.0",
            })
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                wait = RETRY_DELAY * (2 ** attempt) + (5 if e.code == 429 else 0)
                log.warning(f"{e.code} on {label}, retry in {wait}s")
                time.sleep(wait)
                continue
            log.error(f"HTTP {e.code} for {label}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (2 ** attempt))
                continue
            return None
        except Exception as e:
            wait = RETRY_DELAY * (2 ** attempt)
            log.warning(f"Error on {label}: {e}, retry in {wait}s")
            time.sleep(wait)
    log.error(f"FAILED after {MAX_RETRIES} retries: {label}")
    return None


def fetch_day(doc_type, date_str, output_dir):
    out_file = os.path.join(output_dir, doc_type, f"{date_str}.json")

    if os.path.exists(out_file) and os.path.getsize(out_file) > 10:
        try:
            with open(out_file, "r") as f:
                existing = json.load(f)
            if not existing.get("_truncated"):
                with stats_lock:
                    stats["skipped"] += 1
                return True
        except (json.JSONDecodeError, KeyError):
            pass

    url = f"{API_BASE}/{doc_type}?signDateFrom={date_str}&signDateTo={date_str}"
    data = fetch_json(url, f"{doc_type}/{date_str}")
    if data is None:
        with stats_lock:
            stats["failed"] += 1
        return False

    count = data.get("count", 0)
    size = data.get("size", 0)
    more = data.get("moreThenCount", False)

    if count > MAX_DOCS or more:
        data["_truncated"] = True
        data["_actual_count"] = count
        with stats_lock:
            stats["truncated"] += 1
        log.warning(f"TRUNCATED {doc_type}/{date_str}: count={count}, got {size}")

    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    doc_count = size
    with stats_lock:
        stats["downloaded"] += 1
        stats["documents"] += doc_count

    if doc_count > 0:
        log.info(f"OK {doc_type}/{date_str}: {doc_count} docs")

    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", choices=DOC_TYPES + ["all"], default="all")
    parser.add_argument("--from", dest="date_from", default="2016-01-01")
    parser.add_argument("--to", dest="date_to", default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--output", default=OUTPUT_DIR)
    parser.add_argument("--threads", type=int, default=5)
    args = parser.parse_args()

    types = DOC_TYPES if args.type == "all" else [args.type]
    start = datetime.strptime(args.date_from, "%Y-%m-%d")
    end = datetime.strptime(args.date_to, "%Y-%m-%d")

    dates = []
    cur = start
    while cur <= end:
        dates.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)

    for t in types:
        os.makedirs(os.path.join(args.output, t), exist_ok=True)

    tasks = []
    for doc_type in types:
        for date_str in dates:
            if args.resume:
                out_file = os.path.join(args.output, doc_type, f"{date_str}.json")
                if os.path.exists(out_file) and os.path.getsize(out_file) > 10:
                    try:
                        with open(out_file, "r") as f:
                            existing = json.load(f)
                        if not existing.get("_truncated"):
                            stats["skipped"] += 1
                            continue
                    except (json.JSONDecodeError, KeyError):
                        pass
            tasks.append((doc_type, date_str))

    total = len(tasks)
    log.info(f"Starting: {len(types)} types, {len(dates)} days, {total} tasks ({stats['skipped']} skipped), {args.threads} threads")

    if not tasks:
        log.info("Nothing to download.")
        return

    start_time = time.time()
    completed = 0

    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        futures = {executor.submit(fetch_day, dt, ds, args.output): (dt, ds) for dt, ds in tasks}
        for future in as_completed(futures):
            completed += 1
            if completed % 100 == 0 or completed == total:
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (total - completed) / rate / 60 if rate > 0 else 0
                log.info(
                    f"Progress: {completed}/{total} ({completed*100//total}%) "
                    f"| {rate:.1f} days/s | ETA: {eta:.0f}m "
                    f"| docs: {stats['documents']} | failed: {stats['failed']} "
                    f"| truncated: {stats['truncated']}"
                )

    elapsed = time.time() - start_time
    log.info(f"\nDone in {elapsed/60:.1f} minutes")
    log.info(f"Downloaded: {stats['downloaded']} | Skipped: {stats['skipped']} | "
             f"Failed: {stats['failed']} | Truncated: {stats['truncated']} | "
             f"Total docs: {stats['documents']}")


if __name__ == "__main__":
    main()
