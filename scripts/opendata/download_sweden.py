#!/usr/bin/env python3
"""Download Swedish court decisions from HuggingFace and lagen.nu.

Sources:
1. swelaw/swelaw - ~3 GB Parquet, CC0 license, ~25K court cases among other docs
2. lagen.nu - 10,000+ court decisions (Supreme Court, Supreme Administrative Court, etc.)
   Uses /dataset/dv endpoint which provides year-based index pages.
   Volunteer-run site, be polite with request rates.
"""

import json
import os
import re
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from huggingface_hub import snapshot_download
from urllib.parse import urljoin

BASE_DIR = Path("/home/ubuntu/opendata/sweden")
HF_DIR = BASE_DIR / "huggingface"
LAGEN_DIR = BASE_DIR / "lagen-nu"

LAGEN_BASE = "https://lagen.nu"

# Court codes from /dataset/dv with their available year ranges
LAGEN_COURTS = {
    "nja": (1981, 2021),   # Hogsta domstolen (Supreme Court)
    "hfd": (2011, 2023),   # Hogsta forvaltningsdomstolen (Supreme Administrative Court)
    "ad": (1993, 2023),    # Arbetsdomstolen (Labour Court)
    "md": (2004, 2016),    # Marknadsdomstolen (Market Court)
    "mig": (2006, 2023),   # Migrationsoverdomstolen (Migration Court of Appeal)
    "mod": (1999, 2023),   # Miljooverdomstolen (Environmental Court of Appeal)
    "pmod": (2016, 2023),  # Patent och marknadsoverdomstolen
    "ra": (1993, 2010),    # Regeringsratten (old admin supreme)
    "rh": (1993, 2022),    # Hovratt (Courts of Appeal)
    "rk": (2008, 2022),    # Kammarratt (Administrative Courts of Appeal)
}

MAX_LAGEN_WORKERS = 5
LAGEN_BATCH_DELAY = 0.5

LOCAL_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
    "172.31.21.47",
]


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


def fetch_with_retry(url: str, session: requests.Session, retries: int = 5, timeout: int = 60):
    """Fetch URL with exponential backoff retry."""
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  Fetch {url} attempt {attempt+1} failed: {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise


def download_huggingface():
    """Download swelaw/swelaw dataset from HuggingFace."""
    repo_id = "swelaw/swelaw"
    local_dir = HF_DIR / "swelaw"
    print(f"\n{'='*60}")
    print(f"Downloading {repo_id} -> {local_dir}")
    print(f"Expected: ~3 GB Parquet, ~25K court cases + other docs")
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
        print(f"Done: {repo_id} ({size / (1024**3):.2f} GB in {elapsed:.1f}s)")
    except Exception as e:
        print(f"ERROR downloading {repo_id}: {e}")
        raise


def get_court_decisions_index(court: str, year: int, session: requests.Session) -> list:
    """Fetch the index of available decisions for a given court+year from lagen.nu /dataset/dv."""
    decisions = []
    url = f"{LAGEN_BASE}/dataset/dv?{court}={year}"
    try:
        resp = fetch_with_retry(url, session, timeout=30)
        html = resp.text
        # Extract all decision links: href="https://lagen.nu/dom/{court}/{identifier}"
        pattern = r'href="https://lagen\.nu/dom/([^"]+)"'
        matches = re.findall(pattern, html)
        seen = set()
        for match in matches:
            # match is like "nja/2022s1003" or "hfd/2023ref15"
            if match not in seen:
                seen.add(match)
                decisions.append(match)
    except Exception as e:
        print(f"  Failed to get index for {court}/{year}: {e}")

    return decisions


def download_decision(decision_path: str, session: requests.Session) -> bool:
    """Download a single court decision HTML.

    decision_path is like "nja/2022s1003" (court/identifier).
    """
    parts = decision_path.split("/", 1)
    if len(parts) != 2:
        return False
    court, case_id = parts

    court_dir = LAGEN_DIR / court
    court_dir.mkdir(parents=True, exist_ok=True)
    safe_id = case_id.replace("/", "_")
    dest = court_dir / f"{safe_id}.html"

    if dest.exists() and dest.stat().st_size > 100:
        return True

    url = f"{LAGEN_BASE}/dom/{decision_path}"
    for attempt in range(5):
        try:
            resp = session.get(url, timeout=60)
            if resp.status_code == 404:
                return False
            resp.raise_for_status()
            with open(dest, "w", encoding="utf-8") as f:
                f.write(resp.text)
            return True
        except Exception as e:
            if attempt < 4:
                wait = 2 ** attempt
                time.sleep(wait)
            else:
                print(f"    FAILED {decision_path}: {e}")
                return False
    return False


def create_multi_ip_sessions() -> list:
    """Create one session per local IP for parallel multi-IP requests."""
    sessions = []
    for ip in LOCAL_IPS:
        s = requests.Session()
        s.headers["User-Agent"] = "SecondLayer-Legal-Research/1.0 (academic research; mcvovkes@gmail.com)"

        class BoundAdapter(requests.adapters.HTTPAdapter):
            def __init__(self, source_addr, **kw):
                self._source = source_addr
                super().__init__(**kw)

            def init_poolmanager(self, *a, **kw):
                kw["source_address"] = (self._source, 0)
                super().init_poolmanager(*a, **kw)

        adapter = BoundAdapter(ip)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
        sessions.append(s)
    return sessions


def download_lagen():
    """Download court decisions from lagen.nu. Uses multi-IP for higher throughput."""
    LAGEN_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint_file = LAGEN_DIR / "checkpoint.json"

    completed = set()
    if checkpoint_file.exists():
        with open(checkpoint_file) as f:
            cp = json.load(f)
            completed = set(cp.get("completed", []))
            print(f"Resuming, {len(completed)} decisions already downloaded")

    sessions = create_multi_ip_sessions()
    num_workers = len(LOCAL_IPS) * MAX_LAGEN_WORKERS  # 6 x 5 = 30

    print(f"\n{'='*60}")
    print(f"Downloading court decisions from lagen.nu")
    print(f"Courts: {', '.join(LAGEN_COURTS.keys())}")
    print(f"Multi-IP mode: {len(sessions)} IPs x {MAX_LAGEN_WORKERS} workers = {num_workers} parallel")
    print(f"{'='*60}")

    total_downloaded = 0
    total_skipped = 0
    t0 = time.time()

    for court, (start_year, end_year) in LAGEN_COURTS.items():
        print(f"\n  Court: {court} ({start_year}-{end_year})")

        # Gather all decision paths for this court across all years
        all_decisions = []
        for year in range(start_year, end_year + 1):
            time.sleep(LAGEN_BATCH_DELAY)
            decisions = get_court_decisions_index(court, year, sessions[0])
            if decisions:
                print(f"    {year}: {len(decisions)} decisions found")
            all_decisions.extend(decisions)

        # Filter out already completed
        to_download = []
        for decision_path in all_decisions:
            if decision_path not in completed:
                to_download.append(decision_path)
            else:
                total_skipped += 1

        print(f"  Total for {court}: {len(all_decisions)} found, {len(to_download)} to download, {total_skipped} already done")

        if not to_download:
            continue

        # Download in batches
        for i in range(0, len(to_download), num_workers):
            batch = to_download[i:i + num_workers]

            with ThreadPoolExecutor(max_workers=num_workers) as pool:
                futures = {}
                for idx, decision_path in enumerate(batch):
                    s = sessions[idx % len(sessions)]
                    fut = pool.submit(download_decision, decision_path, s)
                    futures[fut] = decision_path

                for future in as_completed(futures):
                    decision_path = futures[future]
                    try:
                        success = future.result()
                        if success:
                            completed.add(decision_path)
                            total_downloaded += 1
                    except Exception as e:
                        print(f"    ERROR {decision_path}: {e}")

            # Save checkpoint after each batch
            with open(checkpoint_file, "w") as f:
                json.dump({"completed": list(completed)}, f)

            # Polite delay between batches
            time.sleep(LAGEN_BATCH_DELAY)

            # Progress report
            elapsed = time.time() - t0
            rate = total_downloaded / elapsed if elapsed > 0 else 0
            print(f"    Progress: {i + len(batch)}/{len(to_download)} | total downloaded: {total_downloaded} | {rate:.1f}/s")

    elapsed = time.time() - t0
    print(f"\nlagen.nu download complete: {total_downloaded} decisions in {elapsed:.0f}s")


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    HF_DIR.mkdir(parents=True, exist_ok=True)

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "hf"):
        download_huggingface()
    if mode in ("all", "lagen"):
        download_lagen()

    print("\n" + "=" * 60)
    print("All Swedish downloads complete!")
    total_size = sum(f.stat().st_size for f in BASE_DIR.rglob("*") if f.is_file())
    print(f"Total size: {total_size / (1024**3):.2f} GB")


if __name__ == "__main__":
    main()
