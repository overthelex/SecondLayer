#!/usr/bin/env python3
"""Download Icelandic court decisions from island.is GraphQL API.

Sources:
- island.is/domar - Unified portal for all Icelandic court decisions
  Uses GraphQL API for listing and Next.js data routes for full text.

Courts:
- Haestirettur (Supreme Court)
- Landsrettur (Court of Appeals)
- Heradsdomur (District Courts)
"""

import base64
import json
import os
import re
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = Path("/home/ubuntu/opendata/iceland")

COURTS = ["Hæstiréttur", "Landsréttur", "Héraðsdómur"]
COURT_DIR_NAMES = {
    "Hæstiréttur": "haestirettur",
    "Landsréttur": "landsrettur",
    "Héraðsdómur": "heradsdomur",
}

GRAPHQL_URL = "https://island.is/api/graphql"
ISLAND_BASE = "https://island.is"
ITEMS_PER_PAGE = 10

MAX_WORKERS_PER_IP = 3
BATCH_DELAY = 1.0
USER_AGENT = "SecondLayer-LegalDataCollector/1.0 (legal.org.ua; research)"

LOCAL_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
    "172.31.21.47",
]


GRAPHQL_QUERY = """
query GetVerdicts($input: WebVerdictsInput!) {
  webVerdicts(input: $input) {
    total
    items {
      id
      title
      court
      caseNumber
      verdictDate
      keywords
      presentings
    }
  }
}
"""


def create_multi_ip_sessions() -> list:
    """Create one session per local IP for parallel multi-IP requests."""
    sessions = []
    for ip in LOCAL_IPS:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        s.headers["Accept"] = "application/json"

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


def save_checkpoint(checkpoint_file: Path, data: dict):
    """Save checkpoint atomically."""
    tmp = checkpoint_file.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, ensure_ascii=False)
    tmp.rename(checkpoint_file)


def load_checkpoint(checkpoint_file: Path) -> dict:
    """Load checkpoint if exists."""
    if checkpoint_file.exists():
        with open(checkpoint_file) as f:
            return json.load(f)
    return {}


def get_build_id(session: requests.Session) -> str:
    """Extract Next.js buildId from island.is/domar page."""
    for attempt in range(5):
        try:
            resp = session.get(f"{ISLAND_BASE}/domar", timeout=30)
            resp.raise_for_status()
            html = resp.text
            # Look for buildId in the page HTML (Next.js embeds it)
            match = re.search(r'"buildId"\s*:\s*"([^"]+)"', html)
            if match:
                return match.group(1)
            # Alternative pattern in __NEXT_DATA__
            match = re.search(r'__NEXT_DATA__.*?"buildId"\s*:\s*"([^"]+)"', html, re.DOTALL)
            if match:
                return match.group(1)
            raise ValueError("buildId not found in page HTML")
        except Exception as e:
            if attempt < 4:
                wait = 2 ** attempt
                print(f"  Failed to get buildId (attempt {attempt+1}): {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise


def fetch_verdict_list(court: str, page: int, session: requests.Session) -> dict:
    """Fetch a page of verdicts from the GraphQL API."""
    payload = {
        "query": GRAPHQL_QUERY,
        "variables": {
            "input": {
                "court": court,
                "page": page,
            }
        }
    }
    for attempt in range(5):
        try:
            resp = session.post(
                GRAPHQL_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            if resp.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                print(f"  Rate limited (429), waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("webVerdicts", {})
        except Exception as e:
            if attempt < 4:
                wait = 2 ** attempt
                print(f"  GraphQL fetch page {page} failed (attempt {attempt+1}): {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                print(f"  GraphQL fetch page {page} FAILED after 5 attempts: {e}")
                return {}
    return {}


def fetch_verdict_detail(verdict_id: str, build_id: str, session: requests.Session) -> dict:
    """Fetch full verdict detail via Next.js data route."""
    url = f"{ISLAND_BASE}/_next/data/{build_id}/domar/{verdict_id}.json"
    for attempt in range(5):
        try:
            resp = session.get(url, timeout=60)
            if resp.status_code == 404:
                return None
            if resp.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                print(f"  Rate limited on detail {verdict_id}, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < 4:
                wait = 2 ** attempt
                time.sleep(wait)
            else:
                print(f"    FAILED detail for {verdict_id}: {e}")
                return None
    return None


def extract_detail_data(detail_json: dict) -> dict:
    """Extract verdict data from the nested Next.js JSON response."""
    if not detail_json:
        return {}
    # Navigate nested pageProps structure
    page_props = detail_json.get("pageProps", {})
    # Try multiple nesting levels as structure may vary
    item = None
    # Direct pageProps.componentProps.item
    if "componentProps" in page_props:
        item = page_props["componentProps"].get("item")
    # Nested pageProps.pageProps.pageProps.componentProps.item
    if not item and "pageProps" in page_props:
        inner = page_props["pageProps"]
        if isinstance(inner, dict) and "pageProps" in inner:
            inner2 = inner["pageProps"]
            if isinstance(inner2, dict) and "componentProps" in inner2:
                item = inner2["componentProps"].get("item")
        elif isinstance(inner, dict) and "componentProps" in inner:
            item = inner["componentProps"].get("item")
    # Also try top-level props
    if not item:
        item = page_props.get("item")
    return item or page_props


def save_verdict(court_dir: Path, verdict_id: str, list_item: dict, detail_data: dict):
    """Save verdict JSON and PDF (if available) to disk."""
    # Save combined JSON
    combined = {
        "list_item": list_item,
        "detail": detail_data,
    }
    json_path = court_dir / f"{verdict_id}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    # Save PDF if pdfString is available (base64 encoded)
    pdf_string = None
    if isinstance(detail_data, dict):
        pdf_string = detail_data.get("pdfString")
    if pdf_string:
        try:
            pdf_bytes = base64.b64decode(pdf_string)
            pdf_path = court_dir / f"{verdict_id}.pdf"
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)
        except Exception as e:
            print(f"    Warning: failed to decode PDF for {verdict_id}: {e}")


def download_court(court: str, build_id: str, sessions: list):
    """Download all verdicts for a given court."""
    court_dir_name = COURT_DIR_NAMES[court]
    court_dir = BASE_DIR / court_dir_name
    court_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_file = court_dir / "checkpoint.json"
    checkpoint = load_checkpoint(checkpoint_file)
    completed_ids = set(checkpoint.get("completed_ids", []))

    num_workers = len(LOCAL_IPS) * MAX_WORKERS_PER_IP  # 6 x 3 = 18

    print(f"\n  Court: {court} ({court_dir_name})")
    print(f"  Workers: {num_workers}")

    if completed_ids:
        print(f"  Resuming: {len(completed_ids)} already downloaded")

    # First, enumerate all verdicts via GraphQL pagination
    print(f"  Fetching verdict list...")
    all_items = []
    page = 1

    # Get first page to find total
    first_result = fetch_verdict_list(court, 1, sessions[0])
    total = first_result.get("total", 0)
    items = first_result.get("items", [])
    all_items.extend(items)

    if total == 0:
        print(f"  No verdicts found for {court}")
        return 0

    total_pages = (total + ITEMS_PER_PAGE - 1) // ITEMS_PER_PAGE
    print(f"  Total: {total} verdicts across {total_pages} pages")

    # Fetch remaining pages
    for page in range(2, total_pages + 1):
        session = sessions[(page - 1) % len(sessions)]
        result = fetch_verdict_list(court, page, session)
        items = result.get("items", [])
        if not items:
            break
        all_items.extend(items)

        if page % 20 == 0:
            print(f"    Listed {page}/{total_pages} pages ({len(all_items)} items)")
        time.sleep(0.3)  # Be polite during listing

    print(f"  Listed {len(all_items)} verdicts total")

    # Filter out already completed
    to_download = []
    for item in all_items:
        verdict_id = item.get("id")
        if verdict_id and verdict_id not in completed_ids:
            to_download.append(item)

    print(f"  To download: {len(to_download)} (skipping {len(all_items) - len(to_download)} completed)")

    if not to_download:
        return 0

    # Download details in parallel batches
    total_downloaded = 0
    t0 = time.time()

    for i in range(0, len(to_download), num_workers):
        batch = to_download[i:i + num_workers]

        with ThreadPoolExecutor(max_workers=num_workers) as pool:
            futures = {}
            for idx, item in enumerate(batch):
                verdict_id = item["id"]
                s = sessions[idx % len(sessions)]
                fut = pool.submit(fetch_verdict_detail, verdict_id, build_id, s)
                futures[fut] = item

            for future in as_completed(futures):
                item = futures[future]
                verdict_id = item["id"]
                try:
                    detail_json = future.result()
                    if detail_json is not None:
                        detail_data = extract_detail_data(detail_json)
                        save_verdict(court_dir, verdict_id, item, detail_data)
                        completed_ids.add(verdict_id)
                        total_downloaded += 1
                    else:
                        # Still mark as completed if 404 (verdict doesn't exist)
                        completed_ids.add(verdict_id)
                except Exception as e:
                    print(f"    ERROR {verdict_id}: {e}")

        # Save checkpoint after each batch
        save_checkpoint(checkpoint_file, {"completed_ids": list(completed_ids)})

        # Polite delay between batches
        time.sleep(BATCH_DELAY)

        # Progress report
        elapsed = time.time() - t0
        rate = total_downloaded / elapsed if elapsed > 0 else 0
        print(f"    Progress: {i + len(batch)}/{len(to_download)} | downloaded: {total_downloaded} | {rate:.1f}/s")

    elapsed = time.time() - t0
    print(f"  {court} complete: {total_downloaded} verdicts in {elapsed:.0f}s")
    return total_downloaded


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    sessions = create_multi_ip_sessions()

    # Get buildId (needed for detail fetches)
    print(f"{'='*60}")
    print(f"Downloading Icelandic court decisions from island.is")
    print(f"{'='*60}")
    print(f"\nFetching Next.js buildId from island.is/domar...")
    build_id = get_build_id(sessions[0])
    print(f"  buildId: {build_id}")

    total_downloaded = 0

    courts_to_download = COURTS
    if mode == "supreme":
        courts_to_download = ["Hæstiréttur"]
    elif mode == "appeals":
        courts_to_download = ["Landsréttur"]
    elif mode == "district":
        courts_to_download = ["Héraðsdómur"]
    elif mode != "all":
        # Allow passing court dir name directly
        name_to_court = {v: k for k, v in COURT_DIR_NAMES.items()}
        if mode in name_to_court:
            courts_to_download = [name_to_court[mode]]
        else:
            print(f"Unknown mode: {mode}")
            print(f"Valid modes: all, supreme, appeals, district, haestirettur, landsrettur, heradsdomur")
            sys.exit(1)

    for court in courts_to_download:
        downloaded = download_court(court, build_id, sessions)
        total_downloaded += downloaded

    print(f"\n{'='*60}")
    print(f"All Icelandic downloads complete! Total: {total_downloaded} verdicts")
    if BASE_DIR.exists():
        total_size = sum(f.stat().st_size for f in BASE_DIR.rglob("*") if f.is_file())
        print(f"Total size: {total_size / (1024**3):.2f} GB")


if __name__ == "__main__":
    main()
