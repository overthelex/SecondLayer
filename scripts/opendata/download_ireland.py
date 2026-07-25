#!/usr/bin/env python3
"""Download Irish court decisions from courts.ie (HTML scraping).

Source: https://www2.courts.ie/Judgments
- Paginated HTML listing sorted by delivery date (descending)
- Individual judgments as HTML pages or PDF files
- Coverage: Supreme Court 2001+, High Court 2004+, Court of Appeal 2014+
- Estimated ~16K judgments total

No API available -- requires HTML scraping.
"""

import json
import os
import re
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse

BASE_DIR = Path("/home/ubuntu/opendata/ireland")
LISTING_URL = "https://www2.courts.ie/Judgments?sort=desc:DateOfDelivery&page={page}"
BASE_URL = "https://www2.courts.ie"

MAX_WORKERS_PER_IP = 5
BATCH_DELAY = 1.5
USER_AGENT = "SecondLayer-Legal-Research/1.0 (academic research)"

LOCAL_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
    "172.31.21.47",
]

# Court type mapping from URL patterns
COURT_TYPES = {
    "supreme": "supreme-court",
    "court-of-appeal": "court-of-appeal",
    "high": "high-court",
    "circuit": "circuit-court",
    "district": "district-court",
    "special": "special-court",
}


def create_multi_ip_sessions() -> list:
    """Create one session per local IP for parallel multi-IP requests."""
    sessions = []
    for ip in LOCAL_IPS:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        s.headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        s.headers["Accept-Language"] = "en-IE,en;q=0.9"

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


def classify_court_type(url: str) -> str:
    """Classify the court type from a judgment URL path."""
    url_lower = url.lower()
    if "supreme" in url_lower:
        return "supreme-court"
    elif "court-of-appeal" in url_lower or "courtofappeal" in url_lower:
        return "court-of-appeal"
    elif "high" in url_lower:
        return "high-court"
    elif "circuit" in url_lower:
        return "circuit-court"
    elif "district" in url_lower:
        return "district-court"
    else:
        return "other"


def extract_case_id(url: str) -> str:
    """Extract a unique case ID from a judgment URL."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    # Use last path segment as base ID
    segments = [s for s in path.split("/") if s]
    if segments:
        case_id = segments[-1]
    else:
        case_id = url.replace("/", "_").replace(":", "")
    # Clean up for filesystem
    case_id = re.sub(r'[^\w\-.]', '_', case_id)
    return case_id


def fetch_listing_page(page_num: int, session: requests.Session) -> str | None:
    """Fetch a listing page from courts.ie."""
    url = LISTING_URL.format(page=page_num)
    for attempt in range(5):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                print(f"  Rate limited (429) on listing page {page_num}, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = min(2 ** (attempt + 1), 60)
                print(f"  Server error {resp.status_code} on listing page {page_num}, retry in {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.text
        except requests.exceptions.RequestException as e:
            if attempt < 4:
                wait = 2 ** attempt
                time.sleep(wait)
            else:
                print(f"  FAILED listing page {page_num}: {e}")
                return None
    return None


def extract_judgment_links(html: str) -> list[dict]:
    """Extract judgment links from a listing page HTML.

    Returns list of dicts with keys: url, title, court, date
    """
    judgments = []

    # Pattern 1: Look for judgment links in typical courts.ie HTML structure
    # Links usually follow pattern: /Judgments/... or /view/...
    link_pattern = re.compile(
        r'<a[^>]+href=["\'](/[Jj]udg[^"\']*?)["\'][^>]*>(.*?)</a>',
        re.DOTALL
    )

    for match in link_pattern.finditer(html):
        href = match.group(1)
        link_text = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        if href and link_text and len(link_text) > 3:
            full_url = urljoin(BASE_URL, href)
            judgments.append({
                "url": full_url,
                "title": link_text,
            })

    # Pattern 2: Alternative link format with /view/ prefix
    view_pattern = re.compile(
        r'<a[^>]+href=["\'](/view/[^"\']+)["\'][^>]*>(.*?)</a>',
        re.DOTALL
    )
    seen_urls = {j["url"] for j in judgments}
    for match in view_pattern.finditer(html):
        href = match.group(1)
        link_text = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        full_url = urljoin(BASE_URL, href)
        if full_url not in seen_urls and link_text and len(link_text) > 3:
            judgments.append({
                "url": full_url,
                "title": link_text,
            })
            seen_urls.add(full_url)

    # Pattern 3: Generic link pattern matching judgment-like URLs
    generic_pattern = re.compile(
        r'href=["\']([^"\']*(?:judgment|decision|ruling|case)[^"\']*)["\']',
        re.IGNORECASE
    )
    for match in generic_pattern.finditer(html):
        href = match.group(1)
        if href.startswith("/"):
            full_url = urljoin(BASE_URL, href)
        elif href.startswith("http"):
            full_url = href
        else:
            continue
        if full_url not in seen_urls:
            judgments.append({
                "url": full_url,
                "title": "",
            })
            seen_urls.add(full_url)

    return judgments


def fetch_judgment(url: str, session: requests.Session) -> dict | None:
    """Fetch an individual judgment page. Returns dict with html and/or pdf_url."""
    for attempt in range(5):
        try:
            resp = session.get(url, timeout=60)
            if resp.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = min(2 ** (attempt + 1), 60)
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()

            content_type = resp.headers.get("Content-Type", "")
            result = {"url": url}

            if "application/pdf" in content_type:
                result["pdf_content"] = resp.content
                result["is_pdf"] = True
            else:
                result["html_content"] = resp.text
                result["is_pdf"] = False
                # Check for PDF links within the HTML page
                pdf_links = re.findall(
                    r'href=["\']([^"\']+\.pdf[^"\']*)["\']',
                    resp.text,
                    re.IGNORECASE
                )
                if pdf_links:
                    result["pdf_links"] = [
                        urljoin(url, link) for link in pdf_links
                    ]

            return result
        except requests.exceptions.RequestException as e:
            if attempt < 4:
                wait = 2 ** attempt
                time.sleep(wait)
            else:
                print(f"    FAILED {url}: {e}")
                return None
    return None


def fetch_pdf(url: str, session: requests.Session) -> bytes | None:
    """Download a PDF file."""
    for attempt in range(5):
        try:
            resp = session.get(url, timeout=90)
            if resp.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = min(2 ** (attempt + 1), 60)
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.content
        except requests.exceptions.RequestException as e:
            if attempt < 4:
                wait = 2 ** attempt
                time.sleep(wait)
            else:
                return None
    return None


def save_judgment(court_dir: Path, case_id: str, data: dict):
    """Save judgment HTML and/or PDF to disk."""
    if data.get("is_pdf") and data.get("pdf_content"):
        pdf_path = court_dir / f"{case_id}.pdf"
        with open(pdf_path, "wb") as f:
            f.write(data["pdf_content"])
    elif data.get("html_content"):
        html_path = court_dir / f"{case_id}.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(data["html_content"])


def discover_all_judgments(sessions: list) -> list[dict]:
    """Paginate through all listing pages to discover judgment URLs."""
    print("\n  Discovering judgments via listing pages...")
    all_judgments = []
    seen_urls = set()
    page = 0
    empty_pages = 0
    max_empty = 3  # Stop after 3 consecutive empty pages

    while empty_pages < max_empty:
        session = sessions[page % len(sessions)]
        html = fetch_listing_page(page, session)

        if html is None:
            empty_pages += 1
            page += 1
            continue

        links = extract_judgment_links(html)
        new_count = 0
        for item in links:
            if item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                all_judgments.append(item)
                new_count += 1

        if new_count == 0:
            empty_pages += 1
        else:
            empty_pages = 0

        if page % 50 == 0:
            print(f"    Page {page}: {len(all_judgments)} total judgments discovered")

        page += 1
        time.sleep(0.5)  # Polite delay during discovery

    print(f"  Discovery complete: {len(all_judgments)} judgments across {page} pages")
    return all_judgments


def download_all(sessions: list):
    """Main download workflow."""
    courts_ie_dir = BASE_DIR / "courts-ie"
    courts_ie_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_file = BASE_DIR / "checkpoint.json"
    checkpoint = load_checkpoint(checkpoint_file)
    completed_urls = set(checkpoint.get("completed_urls", []))
    discovered_judgments = checkpoint.get("discovered_judgments", None)

    num_workers = len(LOCAL_IPS) * MAX_WORKERS_PER_IP  # 6 x 5 = 30

    print(f"\n  Output directory: {courts_ie_dir}")
    print(f"  Workers: {num_workers}")

    if completed_urls:
        print(f"  Resuming: {len(completed_urls)} already downloaded")

    # Discovery phase (or load from checkpoint)
    if discovered_judgments is None:
        all_judgments = discover_all_judgments(sessions)
        # Save discovery to checkpoint
        save_checkpoint(checkpoint_file, {
            "completed_urls": list(completed_urls),
            "discovered_judgments": all_judgments,
        })
    else:
        all_judgments = discovered_judgments
        print(f"  Loaded {len(all_judgments)} judgments from checkpoint")

    # Filter out completed
    to_download = [j for j in all_judgments if j["url"] not in completed_urls]
    print(f"  To download: {len(to_download)} (skipping {len(all_judgments) - len(to_download)} completed)")

    if not to_download:
        print("  Nothing to download!")
        return 0

    # Download phase
    total_downloaded = 0
    total_pdfs = 0
    t0 = time.time()

    for i in range(0, len(to_download), num_workers):
        batch = to_download[i:i + num_workers]

        with ThreadPoolExecutor(max_workers=num_workers) as pool:
            futures = {}
            for idx, item in enumerate(batch):
                s = sessions[idx % len(sessions)]
                fut = pool.submit(fetch_judgment, item["url"], s)
                futures[fut] = item

            for future in as_completed(futures):
                item = futures[future]
                url = item["url"]
                try:
                    result = future.result()
                    if result is not None:
                        court_type = classify_court_type(url)
                        court_dir = courts_ie_dir / court_type
                        court_dir.mkdir(parents=True, exist_ok=True)

                        case_id = extract_case_id(url)
                        save_judgment(court_dir, case_id, result)
                        total_downloaded += 1

                        # Download linked PDFs if any
                        if result.get("pdf_links"):
                            pdf_session = sessions[total_pdfs % len(sessions)]
                            for pdf_url in result["pdf_links"][:1]:  # Only first PDF
                                pdf_content = fetch_pdf(pdf_url, pdf_session)
                                if pdf_content:
                                    pdf_path = court_dir / f"{case_id}.pdf"
                                    with open(pdf_path, "wb") as f:
                                        f.write(pdf_content)
                                    total_pdfs += 1

                    completed_urls.add(url)
                except Exception as e:
                    print(f"    ERROR {url}: {e}")
                    completed_urls.add(url)  # Don't retry broken URLs forever

        # Save checkpoint after each batch
        save_checkpoint(checkpoint_file, {
            "completed_urls": list(completed_urls),
            "discovered_judgments": all_judgments,
        })

        # Polite delay between batches
        time.sleep(BATCH_DELAY)

        # Progress report
        elapsed = time.time() - t0
        rate = total_downloaded / elapsed if elapsed > 0 else 0
        done_count = i + len(batch)
        print(f"    Progress: {done_count}/{len(to_download)} | "
              f"downloaded: {total_downloaded} | pdfs: {total_pdfs} | "
              f"{rate:.1f}/s | elapsed: {elapsed:.0f}s")

    elapsed = time.time() - t0
    print(f"\n  Download complete: {total_downloaded} judgments + {total_pdfs} PDFs in {elapsed:.0f}s")
    return total_downloaded


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode not in ("all",):
        print(f"Unknown mode: {mode}")
        print("Valid modes: all")
        sys.exit(1)

    sessions = create_multi_ip_sessions()

    print(f"{'='*60}")
    print(f"Downloading Irish court decisions from courts.ie")
    print(f"{'='*60}")
    print(f"  Mode: {mode}")
    print(f"  IPs: {len(LOCAL_IPS)}")
    print(f"  Workers per IP: {MAX_WORKERS_PER_IP}")
    print(f"  Total parallelism: {len(LOCAL_IPS) * MAX_WORKERS_PER_IP}")

    total_downloaded = download_all(sessions)

    print(f"\n{'='*60}")
    print(f"Ireland download complete! Total: {total_downloaded} judgments")
    if BASE_DIR.exists():
        total_files = sum(1 for f in BASE_DIR.rglob("*") if f.is_file() and f.name != "checkpoint.json")
        total_size = sum(
            f.stat().st_size for f in BASE_DIR.rglob("*")
            if f.is_file() and f.name != "checkpoint.json"
        )
        print(f"Total files: {total_files}")
        print(f"Total size: {total_size / (1024**3):.2f} GB")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
