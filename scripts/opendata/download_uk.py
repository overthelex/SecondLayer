#!/usr/bin/env python3
"""Download UK court decisions from National Archives Case Law API + HuggingFace datasets."""

import os
import sys
import json
import time
import itertools
import xml.etree.ElementTree as ET
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import urljoin

import requests

BASE_DIR = Path(os.environ.get("OUT_DIR", "/home/ubuntu/opendata/uk"))
API_DIR = BASE_DIR / "national-archives"
HF_DIR = BASE_DIR / "huggingface"
CHECKPOINT = BASE_DIR / "checkpoint.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/xml, text/xml, */*",
}

LOCAL_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
    "172.31.21.47",
]

COURTS = {
    "uksc": "UK Supreme Court",
    "ukpc": "Privy Council",
    "ewca/civ": "Court of Appeal (Civil)",
    "ewca/crim": "Court of Appeal (Criminal)",
    "ewhc/admin": "Administrative Court",
    "ewhc/ch": "Chancery Division",
    "ewhc/kb": "King's Bench Division",
    "ewhc/comm": "Commercial Court",
    "ewhc/fam": "Family Division",
    "ewhc/tcc": "Technology & Construction",
    "ewfc": "Family Court",
    "ukftt/grc": "General Regulatory Chamber",
    "ukftt/tc": "Tax Chamber",
    "ukut/aac": "Upper Tribunal AAC",
    "ukut/iac": "Upper Tribunal IAC",
    "ewcop": "Court of Protection",
    "ewhc/pat": "Patents Court",
    "eat": "Employment Appeal Tribunal",
    "ewhc/scco": "Senior Costs Office",
    "ukut/lc": "Upper Tribunal Lands",
    "ukut/tcc": "Upper Tribunal Tax",
    "ewhc/ipec": "IP Enterprise Court",
}

BASE_URL = "https://caselaw.nationalarchives.gov.uk"
ATOM_NS = "http://www.w3.org/2005/Atom"


# ============================================================
# Multi-IP session pool
# ============================================================

class SourceAddressAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, source_address, **kwargs):
        self._source_address = source_address
        super().__init__(**kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs["source_address"] = (self._source_address, 0)
        super().init_poolmanager(*args, **kwargs)


def get_session_for_ip(ip):
    s = requests.Session()
    s.headers.update(HEADERS)
    adapter = SourceAddressAdapter(source_address=ip)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSIONS = {ip: get_session_for_ip(ip) for ip in LOCAL_IPS}
_ip_cycle = itertools.cycle(LOCAL_IPS)


def get_next_session():
    ip = next(_ip_cycle)
    return SESSIONS[ip], ip


# ============================================================
# Checkpoint management
# ============================================================

def load_checkpoint():
    if CHECKPOINT.exists():
        return json.loads(CHECKPOINT.read_text())
    return {
        "courts_done": [],
        "court_pages": {},      # court_code -> last completed page
        "downloaded_uris": {},  # court_code -> list of completed URIs
    }


def save_checkpoint(cp):
    CHECKPOINT.write_text(json.dumps(cp, ensure_ascii=False, indent=2))


# ============================================================
# National Archives API
# ============================================================

def parse_atom_feed(xml_text):
    """Parse Atom XML feed, return (entries, next_url)."""
    entries = []
    next_url = None

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"    XML parse error: {e}", flush=True)
        return entries, next_url

    for entry in root.findall(f"{{{ATOM_NS}}}entry"):
        title_el = entry.find(f"{{{ATOM_NS}}}title")
        updated_el = entry.find(f"{{{ATOM_NS}}}updated")
        link_el = entry.find(f"{{{ATOM_NS}}}link[@rel='alternate']")
        if link_el is None:
            link_el = entry.find(f"{{{ATOM_NS}}}link")
        id_el = entry.find(f"{{{ATOM_NS}}}id")

        uri = None
        if link_el is not None:
            href = link_el.get("href", "")
            # URI is the path portion after the base URL
            if href.startswith(BASE_URL):
                uri = href[len(BASE_URL):]
            elif href.startswith("/"):
                uri = href
            else:
                uri = href

        entries.append({
            "title": title_el.text if title_el is not None else "",
            "updated": updated_el.text if updated_el is not None else "",
            "uri": uri,
            "id": id_el.text if id_el is not None else "",
        })

    # Find next page link
    for link in root.findall(f"{{{ATOM_NS}}}link"):
        if link.get("rel") == "next":
            next_url = link.get("href", "")
            break

    return entries, next_url


def fetch_atom_page(url, session, max_retries=5):
    """Fetch a single Atom feed page with retries and backoff."""
    for attempt in range(max_retries):
        try:
            r = session.get(url, timeout=60)
            if r.status_code == 200:
                return r.text
            elif r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", 60))
                print(f"    429 rate limited, waiting {retry_after}s", flush=True)
                time.sleep(retry_after)
            elif r.status_code >= 500:
                time.sleep((attempt + 1) * 5)
            else:
                print(f"    HTTP {r.status_code} for {url}", flush=True)
                time.sleep((attempt + 1) * 3)
        except requests.exceptions.RequestException as e:
            time.sleep((attempt + 1) * 5)

    return None


def download_judgment_xml(uri, court_dir, session, max_retries=5):
    """Download a single judgment XML by its URI."""
    # Build safe filename from URI
    safe_name = uri.strip("/").replace("/", "_") + ".xml"
    out_path = court_dir / safe_name

    if out_path.exists() and out_path.stat().st_size > 100:
        return uri, True, 0  # already exists

    data_url = f"{BASE_URL}{uri}/data.xml"

    for attempt in range(max_retries):
        try:
            r = session.get(data_url, timeout=60)
            if r.status_code == 200 and len(r.content) > 100:
                out_path.write_bytes(r.content)
                return uri, True, len(r.content)
            elif r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", 60))
                time.sleep(retry_after)
            elif r.status_code == 404:
                return uri, False, 0
            else:
                time.sleep((attempt + 1) * 3)
        except requests.exceptions.RequestException:
            time.sleep((attempt + 1) * 5)

    return uri, False, 0


def run_court(court_code, court_name, cp):
    """Download all judgments for a single court."""
    safe_court = court_code.replace("/", "_")
    court_dir = API_DIR / safe_court
    court_dir.mkdir(parents=True, exist_ok=True)
    metadata_file = court_dir / "metadata.jsonl"

    # Resume from last page
    start_page = cp.get("court_pages", {}).get(court_code, 0) + 1
    done_uris = set(cp.get("downloaded_uris", {}).get(court_code, []))

    print(f"\n  [{court_code}] {court_name}", flush=True)
    print(f"    Resuming from page {start_page}, {len(done_uris)} already downloaded", flush=True)

    # Phase 1: Collect all URIs from Atom feed
    all_entries = []
    page = start_page
    url = f"{BASE_URL}/atom.xml?court={court_code}&page={page}&per_page=50"

    session, ip = get_next_session()

    while url:
        xml_text = fetch_atom_page(url, session)
        if xml_text is None:
            print(f"    Failed to fetch page {page}, stopping pagination", flush=True)
            break

        entries, next_url = parse_atom_feed(xml_text)
        if not entries:
            break

        all_entries.extend(entries)

        # Update checkpoint for page
        if "court_pages" not in cp:
            cp["court_pages"] = {}
        cp["court_pages"][court_code] = page

        if page % 10 == 0:
            save_checkpoint(cp)
            print(f"    Page {page}: {len(all_entries)} entries so far", flush=True)

        page += 1
        url = next_url

        # Small delay between pagination requests
        time.sleep(0.3)

    print(f"    Found {len(all_entries)} total entries in feed", flush=True)

    # Phase 2: Download XMLs in parallel (5 workers per IP, 6 IPs = 30 total)
    to_download = [e for e in all_entries if e["uri"] and e["uri"] not in done_uris]
    print(f"    Downloading {len(to_download)} new judgments ({len(done_uris)} skipped)", flush=True)

    if not to_download:
        return len(done_uris)

    success = 0
    fail = 0
    total_bytes = 0
    start_time = time.time()

    # Create worker pool with IP rotation
    workers_per_ip = 5
    total_workers = len(LOCAL_IPS) * workers_per_ip

    # Assign entries to IPs round-robin
    ip_assignments = {}
    for i, entry in enumerate(to_download):
        ip = LOCAL_IPS[i % len(LOCAL_IPS)]
        if ip not in ip_assignments:
            ip_assignments[ip] = []
        ip_assignments[ip].append(entry)

    def download_with_ip(entry, ip):
        session = SESSIONS[ip]
        return download_judgment_xml(entry["uri"], court_dir, session)

    with ThreadPoolExecutor(max_workers=total_workers) as pool:
        futures = {}
        for ip, entries in ip_assignments.items():
            for entry in entries:
                fut = pool.submit(download_with_ip, entry, ip)
                futures[fut] = entry

        metadata_entries = []
        for i, fut in enumerate(as_completed(futures)):
            uri, ok, size = fut.result()
            entry = futures[fut]

            if ok:
                success += 1
                total_bytes += size
                if "downloaded_uris" not in cp:
                    cp["downloaded_uris"] = {}
                if court_code not in cp["downloaded_uris"]:
                    cp["downloaded_uris"][court_code] = []
                cp["downloaded_uris"][court_code].append(uri)

                metadata_entries.append({
                    "uri": uri,
                    "title": entry["title"],
                    "date": entry["updated"],
                    "court": court_code,
                })
            else:
                fail += 1

            if (i + 1) % 100 == 0:
                elapsed = time.time() - start_time
                rate = (success + fail) / elapsed if elapsed > 0 else 0
                print(
                    f"    [{i+1}/{len(to_download)}] "
                    f"{success} ok, {fail} fail, "
                    f"{rate:.1f} req/s, {total_bytes/1024/1024:.1f} MB",
                    flush=True,
                )
                save_checkpoint(cp)

        # Write metadata
        if metadata_entries:
            with open(metadata_file, "a", encoding="utf-8") as f:
                for m in metadata_entries:
                    f.write(json.dumps(m, ensure_ascii=False) + "\n")

    save_checkpoint(cp)
    elapsed = time.time() - start_time
    print(
        f"    Done: {success} ok, {fail} fail, "
        f"{total_bytes/1024/1024:.1f} MB in {elapsed:.0f}s",
        flush=True,
    )

    return success + len(done_uris)


def run_national_archives():
    """Download all courts from National Archives API."""
    API_DIR.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()

    print("=" * 60, flush=True)
    print("National Archives Case Law API", flush=True)
    print(f"Courts: {len(COURTS)}", flush=True)
    print("=" * 60, flush=True)

    total_all = 0
    done_courts = set(cp.get("courts_done", []))

    for court_code, court_name in COURTS.items():
        if court_code in done_courts:
            print(f"\n  [{court_code}] SKIPPED (already complete)", flush=True)
            continue

        count = run_court(court_code, court_name, cp)
        total_all += count

        # Mark court as done
        if "courts_done" not in cp:
            cp["courts_done"] = []
        cp["courts_done"].append(court_code)
        save_checkpoint(cp)

    print(f"\n{'=' * 60}", flush=True)
    print(f"National Archives TOTAL: {total_all:,} judgments", flush=True)
    print("=" * 60, flush=True)

    return total_all


# ============================================================
# HuggingFace datasets
# ============================================================

def run_hf_uk_courts():
    """Download santoshtyss/uk_courts_cases (43K cases, 983 MB)."""
    out_dir = HF_DIR / "uk_courts_cases"
    out_dir.mkdir(parents=True, exist_ok=True)
    print("\n=== HuggingFace: santoshtyss/uk_courts_cases (43K cases) ===", flush=True)

    from huggingface_hub import snapshot_download
    path = snapshot_download(
        "santoshtyss/uk_courts_cases",
        repo_type="dataset",
        local_dir=str(out_dir),
        max_workers=20,
    )
    print(f"  Downloaded to: {path}", flush=True)

    # Count records
    try:
        import pyarrow.parquet as pq
        total = 0
        for f in sorted(Path(path).rglob("*.parquet")):
            pf = pq.ParquetFile(f)
            total += pf.metadata.num_rows
        print(f"  uk_courts_cases total: {total:,} cases", flush=True)
        return total
    except Exception as e:
        print(f"  Could not count records: {e}", flush=True)
        return 0


def run_hf_juddges():
    """Download JuDDGES/en-court-raw (6K cases, 85.7 MB)."""
    out_dir = HF_DIR / "juddges_en"
    out_dir.mkdir(parents=True, exist_ok=True)
    print("\n=== HuggingFace: JuDDGES/en-court-raw (6K cases) ===", flush=True)

    from huggingface_hub import snapshot_download
    path = snapshot_download(
        "JuDDGES/en-court-raw",
        repo_type="dataset",
        local_dir=str(out_dir),
        max_workers=20,
    )
    print(f"  Downloaded to: {path}", flush=True)

    # Count records
    try:
        import pyarrow.parquet as pq
        total = 0
        for f in sorted(Path(path).rglob("*.parquet")):
            pf = pq.ParquetFile(f)
            total += pf.metadata.num_rows
        print(f"  JuDDGES/en-court-raw total: {total:,} cases", flush=True)
        return total
    except Exception as e:
        print(f"  Could not count records: {e}", flush=True)
        return 0


def run_huggingface():
    """Download all HuggingFace datasets."""
    HF_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60, flush=True)
    print("HuggingFace UK Court Datasets", flush=True)
    print("=" * 60, flush=True)

    total = 0
    total += run_hf_uk_courts()
    total += run_hf_juddges()

    print(f"\nHuggingFace TOTAL: {total:,} cases", flush=True)
    return total


# ============================================================
# Main
# ============================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python download_uk.py <mode>", flush=True)
        print("  Modes: all, api, hf", flush=True)
        sys.exit(1)

    mode = sys.argv[1].lower()
    BASE_DIR.mkdir(parents=True, exist_ok=True)

    start_time = time.time()
    print(f"UK Court Decisions Download - {datetime.now().isoformat()}", flush=True)
    print(f"Mode: {mode}", flush=True)
    print(f"Output: {BASE_DIR}", flush=True)
    print(f"IPs: {len(LOCAL_IPS)}", flush=True)
    print("", flush=True)

    total = 0

    if mode in ("all", "api"):
        total += run_national_archives()

    if mode in ("all", "hf"):
        total += run_huggingface()

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}", flush=True)
    print(f"COMPLETE: {total:,} total documents in {elapsed/60:.1f} min", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
