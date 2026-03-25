#!/usr/bin/env python3
"""
Sequential index crawl for zakon.rada.gov.ua.
One request at a time, 2s delay. Reliable but slower.
Split across servers with START_PAGE/END_PAGE env vars.

Usage:
    python3 crawl-index-sequential.py                          # all pages
    START_PAGE=1 END_PAGE=2910 python3 crawl-index-sequential.py  # first half
"""

import json
import os
import re
import sys
import time
import subprocess
from urllib.parse import unquote

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_FILE = os.path.join(SCRIPT_DIR, "all-rada-ids.json")
DELAY = 2  # seconds between requests

def fetch_page(url):
    """Fetch URL using curl --compressed (handles gzip properly)."""
    try:
        result = subprocess.run(
            ["curl", "-s", "--compressed", "-m", "30",
             "-H", "User-Agent: Mozilla/5.0 (compatible; SecondLayer/1.0)",
             url],
            capture_output=True, text=True, timeout=40
        )
        if result.returncode == 0:
            return result.stdout
    except Exception as e:
        print(f"  Error fetching {url}: {e}", file=sys.stderr)
    return None

def extract_ids(html):
    ids = set()
    for m in re.finditer(r'/laws/show/([^/?#"\'<>\s]+)', html):
        rada_id = unquote(m.group(1))
        if rada_id and len(rada_id) < 200 and '/print' not in rada_id:
            ids.add(rada_id)
    return ids

def main():
    start_page = int(os.environ.get("START_PAGE", "1"))
    end_page = int(os.environ.get("END_PAGE", "0"))  # 0 = auto-detect

    # Load existing
    all_ids = set()
    if os.path.exists(INDEX_FILE):
        all_ids = set(json.load(open(INDEX_FILE)))
        print(f"Loaded {len(all_ids)} existing ids")

    # Discover total pages from first page
    print("Fetching page 1...")
    html = fetch_page("https://zakon.rada.gov.ua/laws/main/a/page")
    if not html:
        print("ERROR: Cannot fetch first page")
        return

    page_re = re.compile(r'/laws/main/a/page(\d+)')
    matches = page_re.findall(html)
    max_page = max(int(m) for m in matches) if matches else 1

    if end_page == 0:
        end_page = max_page

    all_ids.update(extract_ids(html))
    print(f"Total pages: {max_page}, crawling {start_page}-{end_page}, current ids: {len(all_ids)}")

    errors = 0
    start_time = time.time()

    for page_num in range(start_page, end_page + 1):
        if page_num == 1:
            continue  # already fetched

        html = fetch_page(f"https://zakon.rada.gov.ua/laws/main/a/page{page_num}")
        if html:
            new_ids = extract_ids(html)
            all_ids.update(new_ids)
        else:
            errors += 1
            # On error, wait longer
            time.sleep(5)

        # Progress
        done = page_num - start_page + 1
        total = end_page - start_page + 1
        if done % 100 == 0 or page_num == end_page:
            elapsed = time.time() - start_time
            rate = done / elapsed if elapsed > 0 else 0
            eta = (total - done) / rate / 60 if rate > 0 else 0
            print(f"  Page {page_num}/{end_page} ({done*100//total}%) | {len(all_ids)} ids | {errors} errors | {rate:.1f} pg/s | ETA: {eta:.0f}m")

        # Checkpoint every 500 pages
        if done % 500 == 0:
            json.dump(sorted(all_ids), open(INDEX_FILE, "w"), ensure_ascii=False)
            print(f"  Checkpoint: {len(all_ids)} ids saved")

        time.sleep(DELAY)

    # Final save
    json.dump(sorted(all_ids), open(INDEX_FILE, "w"), ensure_ascii=False)
    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed/60:.1f}m: {len(all_ids)} total ids, {errors} errors")

if __name__ == "__main__":
    main()
