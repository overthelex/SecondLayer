#!/usr/bin/env python3
"""Download court decisions from France, Germany, Belgium."""

import os
import sys
import json
import time
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

OUT_DIR = Path(os.environ.get("OUT_DIR", "/home/ubuntu/opendata/western-europe"))
FR_DIR = OUT_DIR / "france"
DE_DIR = OUT_DIR / "germany"
BE_DIR = OUT_DIR / "belgium"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
}


# ============================================================
# FRANCE - HuggingFace dataset (trivial)
# ============================================================

def run_france():
    FR_DIR.mkdir(parents=True, exist_ok=True)
    print("=== France: downloading from HuggingFace ===", flush=True)

    from huggingface_hub import snapshot_download
    path = snapshot_download(
        "antoinejeannot/jurisprudence",
        repo_type="dataset",
        local_dir=str(FR_DIR / "hf-jurisprudence"),
        max_workers=20,
    )
    print(f"  Downloaded to: {path}", flush=True)

    # Count records
    import pyarrow.parquet as pq
    total = 0
    for f in sorted(Path(path).rglob("*.parquet")):
        pf = pq.ParquetFile(f)
        total += pf.metadata.num_rows
    print(f"  France total: {total:,} decisions", flush=True)


# ============================================================
# GERMANY - HuggingFace dataset (trivial)
# ============================================================

def run_germany():
    DE_DIR.mkdir(parents=True, exist_ok=True)
    print("\n=== Germany: downloading from HuggingFace ===", flush=True)

    from huggingface_hub import snapshot_download

    # Primary: harshildarji/openlegaldata (251K, open access)
    print("  Downloading harshildarji/openlegaldata...", flush=True)
    path1 = snapshot_download(
        "harshildarji/openlegaldata",
        repo_type="dataset",
        local_dir=str(DE_DIR / "hf-harshildarji"),
        max_workers=20,
    )
    print(f"  Downloaded to: {path1}", flush=True)

    # Secondary: SH108/german-court-decisions (60K federal + state)
    print("  Downloading SH108/german-court-decisions...", flush=True)
    try:
        path2 = snapshot_download(
            "SH108/german-court-decisions",
            repo_type="dataset",
            local_dir=str(DE_DIR / "hf-sh108"),
            max_workers=20,
        )
        print(f"  Downloaded to: {path2}", flush=True)
    except Exception as e:
        print(f"  SH108 failed (may be gated): {e}", flush=True)

    import pyarrow.parquet as pq
    total = 0
    for f in sorted(Path(DE_DIR).rglob("*.parquet")):
        pf = pq.ParquetFile(f)
        total += pf.metadata.num_rows
    print(f"  Germany total: {total:,} decisions", flush=True)


# ============================================================
# BELGIUM - OpenJustice.be API + Constitutional Court
# ============================================================

BE_ECLI_API = "https://ecli.openjustice.be"
BE_CC_URL = "https://www.const-court.be/public/f/{year}/{year}-{num:03d}f.pdf"
BE_CC_URL_NL = "https://www.const-court.be/public/n/{year}/{year}-{num:03d}n.pdf"


def fetch_be_openjustice():
    """Fetch decisions from OpenJustice.be ECLI API."""
    oj_dir = BE_DIR / "openjustice"
    oj_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    # Try the documented API endpoints
    courts = ["RVSCDE", "CC", "CASS", "GHCC"]
    total = 0

    for court in courts:
        page = 1
        court_items = []
        print(f"  OpenJustice: fetching {court}...", flush=True)

        while True:
            try:
                r = session.get(
                    f"{BE_ECLI_API}/ecli?court={court}&page={page}&per_page=100",
                    timeout=30
                )
                if r.status_code != 200:
                    # Try alternative endpoint
                    r = session.get(
                        f"{BE_ECLI_API}/api/decisions?court={court}&page={page}&limit=100",
                        timeout=30
                    )
                if r.status_code != 200 or not r.text.strip():
                    break

                data = r.json()
                items = data if isinstance(data, list) else data.get("items", data.get("results", []))
                if not items:
                    break

                court_items.extend(items)
                page += 1
                time.sleep(0.5)

                if page > 5000:  # safety limit
                    break
            except Exception as e:
                print(f"    Error page {page}: {e}", flush=True)
                break

        if court_items:
            out = oj_dir / f"{court}.jsonl"
            with open(out, "w", encoding="utf-8") as f:
                for item in court_items:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
            total += len(court_items)
            print(f"    {court}: {len(court_items)} decisions", flush=True)
        else:
            print(f"    {court}: 0 (API may be down)", flush=True)

    return total


def fetch_be_constitutional():
    """Download Belgian Constitutional Court decisions by year."""
    cc_dir = BE_DIR / "constitutional"
    cc_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    total = 0
    for year in range(1985, 2027):
        year_items = []
        for num in range(1, 250):
            url = f"https://www.const-court.be/public/f/{year}/{year}-{num:03d}f.pdf"
            try:
                r = session.head(url, timeout=10, allow_redirects=True)
                if r.status_code == 200:
                    year_items.append({"year": year, "num": num, "url": url})
                elif r.status_code == 404:
                    if num > 10:  # allow gaps in first 10
                        break
            except Exception:
                pass

        if year_items:
            # Download PDFs
            year_dir = cc_dir / str(year)
            year_dir.mkdir(exist_ok=True)
            for item in year_items:
                pdf_path = year_dir / f"{item['year']}-{item['num']:03d}.pdf"
                if not pdf_path.exists():
                    try:
                        r = session.get(item["url"], timeout=30)
                        if r.status_code == 200:
                            pdf_path.write_bytes(r.content)
                    except Exception:
                        pass

            total += len(year_items)
            print(f"  CC {year}: {len(year_items)} decisions", flush=True)

    print(f"  Constitutional Court total: {total}", flush=True)
    return total


def run_belgium():
    BE_DIR.mkdir(parents=True, exist_ok=True)
    print("\n=== Belgium: OpenJustice.be + Constitutional Court ===", flush=True)

    oj_total = fetch_be_openjustice()
    cc_total = fetch_be_constitutional()
    print(f"\n  Belgium total: {oj_total + cc_total} decisions", flush=True)


# ============================================================
# MAIN
# ============================================================

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "fr", "france"):
        run_france()

    if mode in ("all", "de", "germany"):
        run_germany()

    if mode in ("all", "be", "belgium"):
        run_belgium()

    print("\n=== Western Europe downloads done ===", flush=True)


if __name__ == "__main__":
    main()
