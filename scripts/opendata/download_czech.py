#!/usr/bin/env python3
"""Download Czech court decisions: justice.cz API + CzCDC + Zenodo."""

import json
import os
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = Path("/home/ubuntu/opendata/czech")
JUSTICE_DIR = BASE_DIR / "justice-api"
CZDC_DIR = BASE_DIR / "czcdc"
ZENODO_DIR = BASE_DIR / "zenodo-paulik"

JUSTICE_API = "https://rozhodnuti.justice.cz/api/opendata"
MAX_WORKERS = 20


def download_file(url: str, dest: Path, session: requests.Session = None):
    """Download a file with resume support."""
    s = session or requests.Session()
    dest.parent.mkdir(parents=True, exist_ok=True)
    headers = {}
    mode = "wb"
    if dest.exists():
        existing = dest.stat().st_size
        headers["Range"] = f"bytes={existing}-"
        mode = "ab"
    resp = s.get(url, headers=headers, stream=True, timeout=120)
    if resp.status_code == 416:
        return
    resp.raise_for_status()
    with open(dest, mode) as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)


def fetch_json(url: str, session: requests.Session, retries: int = 5):
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise


def download_day(year: int, month: int, day: int, session: requests.Session):
    """Download all decisions for a given day, handling pagination."""
    day_dir = JUSTICE_DIR / str(year) / f"{month:02d}" / f"{day:02d}"
    day_dir.mkdir(parents=True, exist_ok=True)

    page = 0
    all_items = []
    while True:
        url = f"{JUSTICE_API}/{year}/{month}/{day}?page={page}"
        data = fetch_json(url, session)
        items = data.get("items", [])
        all_items.extend(items)
        if page >= data.get("totalPages", 1) - 1:
            break
        page += 1

    out_file = day_dir / "decisions.json"
    with open(out_file, "w") as f:
        json.dump(all_items, f, ensure_ascii=False)

    return len(all_items)


def download_justice_api():
    """Download all decisions from rozhodnuti.justice.cz API."""
    JUSTICE_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint_file = JUSTICE_DIR / "checkpoint.json"

    completed_days = set()
    if checkpoint_file.exists():
        with open(checkpoint_file) as f:
            cp = json.load(f)
            completed_days = set(cp.get("completed_days", []))
            print(f"Resuming, {len(completed_days)} days already done")

    session = requests.Session()
    session.headers["Accept"] = "application/json"

    years = fetch_json(JUSTICE_API, session)
    total_decisions = sum(y["pocet"] for y in years)
    print(f"\njustice.cz API: {total_decisions} decisions across {len(years)} years")

    all_days = []
    for year_info in years:
        year = year_info["rok"]
        months = fetch_json(year_info["odkaz"], session)
        for month_info in months:
            month = month_info["mesic"]
            days = fetch_json(month_info["odkaz"], session)
            for day_info in days:
                day_key = day_info["datum"]
                if day_key not in completed_days:
                    parts = day_key.split("-")
                    all_days.append((int(parts[0]), int(parts[1]), int(parts[2]), day_info["pocet"]))

    print(f"Days to download: {len(all_days)} (skipping {len(completed_days)} completed)")

    downloaded = 0
    t0 = time.time()
    batch_size = MAX_WORKERS

    for i in range(0, len(all_days), batch_size):
        batch = all_days[i:i + batch_size]

        with ThreadPoolExecutor(max_workers=batch_size) as pool:
            futures = {}
            for (y, m, d, cnt) in batch:
                fut = pool.submit(download_day, y, m, d, session)
                futures[fut] = f"{y}-{m:02d}-{d:02d}"

            for future in as_completed(futures):
                day_key = futures[future]
                try:
                    count = future.result()
                    downloaded += count
                    completed_days.add(day_key)
                except Exception as e:
                    print(f"  FAILED {day_key}: {e}")

        with open(checkpoint_file, "w") as f:
            json.dump({"completed_days": list(completed_days)}, f)

        elapsed = time.time() - t0
        rate = downloaded / elapsed if elapsed > 0 else 0
        pct = downloaded / total_decisions * 100
        done_days = len(completed_days)
        total_days_all = done_days + len(all_days) - (i + len(batch))
        print(f"  Batch {i//batch_size+1} | {downloaded}/{total_decisions} ({pct:.1f}%) | {rate:.0f}/s | days: {done_days}")

    print(f"\njustice.cz download complete: {downloaded} decisions")


def download_czcdc():
    """Download CzCDC 1.0 from LINDAT (6 files: 3 ZIPs + 3 CSVs)."""
    CZDC_DIR.mkdir(parents=True, exist_ok=True)
    files = {
        "ConCo.zip": "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/ac62dab4-5aba-408c-83eb-b3984b526454/content",
        "SupAdmCo.zip": "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/ce56abe9-9987-4029-86da-ed8aeb3b2c7e/content",
        "SupCo.zip": "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/e6c91627-b762-4fc4-93c4-ae9cd796904d/content",
        "ConCo.csv": "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/e5613c2d-87f0-466e-a7e3-823ef2be299b/content",
        "SupAdmCo.csv": "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/9785df4e-1a7c-4565-92c3-15634f06ab20/content",
        "SupCo.csv": "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/62b012f2-e01b-4488-bf9b-ecfeb205ac2e/content",
    }
    session = requests.Session()
    for fname, url in files.items():
        dest = CZDC_DIR / fname
        if dest.exists() and dest.stat().st_size > 10_000:
            print(f"  {fname} already downloaded ({dest.stat().st_size / 1e6:.1f} MB), skipping")
            continue
        print(f"  Downloading {fname}...")
        download_file(url, dest, session)
        print(f"  Done: {fname} ({dest.stat().st_size / 1e6:.1f} MB)")


def download_zenodo():
    """Download Paulik Czech Constitutional Court dataset from Zenodo."""
    ZENODO_DIR.mkdir(parents=True, exist_ok=True)
    url = "https://zenodo.org/records/11618008/files/ccc_database.zip?download=1"
    dest = ZENODO_DIR / "ccc_database.zip"
    if dest.exists() and dest.stat().st_size > 100_000_000:
        print(f"Zenodo already downloaded: {dest} ({dest.stat().st_size / 1e6:.0f} MB)")
        return
    print(f"Downloading Paulik dataset from Zenodo -> {dest}")
    session = requests.Session()
    download_file(url, dest, session)
    print(f"Done: {dest} ({dest.stat().st_size / 1e6:.0f} MB)")


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "czcdc"):
        download_czcdc()
    if mode in ("all", "zenodo"):
        download_zenodo()
    if mode in ("all", "justice"):
        download_justice_api()

    print("\n" + "=" * 60)
    print("All Czech downloads complete!")
    total_size = sum(f.stat().st_size for f in BASE_DIR.rglob("*") if f.is_file())
    print(f"Total size: {total_size / (1024**3):.1f} GB")


if __name__ == "__main__":
    main()
