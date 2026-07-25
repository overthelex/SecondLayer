#!/usr/bin/env python3
"""
Download Singapore court decisions from eLitigation (elitigation.sg/gdviewer/).

Scrapes the listing pages to discover all decisions, then downloads full HTML
for each one. Supports checkpoint/resume, configurable concurrency, and
per-request delay to be respectful.

Usage:
    python download_elitigation.py [--out-dir DIR] [--workers N] [--delay SEC] [--year YEAR]
"""

import argparse
import json
import os
import re
import sys
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("sg-elitigation")

BASE_URL = "https://www.elitigation.sg"
LISTING_URL = f"{BASE_URL}/gdviewer/Home/Index"
JUDGMENT_URL = f"{BASE_URL}/gdviewer/s"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

COURT_CODES = {
    "SGCA": "Court of Appeal",
    "SGHC": "High Court (General Division)",
    "SGHCA": "High Court (Appellate Division)",
    "SGHCI": "High Court (International / SICC)",
    "SGHCF": "High Court (Family Division)",
    "SGHCR": "High Court (Registrar)",
    "SGDC": "District Court",
    "SGMC": "Magistrates' Court",
    "SGFC": "Family Court",
    "SGSCT": "Small Claims Tribunal",
    "SGCDT": "Community Disputes Resolution Tribunal",
    "SGCAI": "Court of Appeal (International)",
}

YEARS = list(range(2000, 2027))
MAX_RETRIES = 5
ITEMS_PER_PAGE = 10


def get_session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def load_checkpoint(cp_path):
    if cp_path.exists():
        return json.loads(cp_path.read_text())
    return {
        "listing_done": False,
        "years_done": [],
        "year_pages": {},
        "discovered": [],
        "downloaded": [],
        "failed": [],
    }


def save_checkpoint(cp_path, cp):
    cp_path.write_text(json.dumps(cp, ensure_ascii=False, indent=2))


def fetch_with_retry(session, url, max_retries=MAX_RETRIES, delay=2):
    for attempt in range(max_retries):
        try:
            r = session.get(url, timeout=60)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 60))
                log.warning(f"429 rate limited, waiting {wait}s")
                time.sleep(wait)
                continue
            if r.status_code >= 500:
                log.warning(f"HTTP {r.status_code} for {url}, retry {attempt+1}")
                time.sleep((attempt + 1) * 5)
                continue
            log.warning(f"HTTP {r.status_code} for {url}")
            time.sleep((attempt + 1) * 3)
        except requests.exceptions.RequestException as e:
            log.warning(f"Request error: {e}, retry {attempt+1}")
            time.sleep((attempt + 1) * 5)
    return None


# ============================================================
# Phase 1: Discover all citations from listing pages
# ============================================================

def parse_listing_page(html):
    """Parse a listing page and extract case entries."""
    soup = BeautifulSoup(html, "html.parser")
    entries = []

    for card in soup.select("div.card, div.judgment-card, div.row"):
        links = card.find_all("a", href=True)
        for link in links:
            href = link.get("href", "")
            if "/gdviewer/s/" not in href:
                continue

            citation_match = re.search(r'/s/(\d{4}_\w+_\d+)', href)
            if not citation_match:
                continue

            raw_citation = citation_match.group(1)
            text = link.get_text(strip=True)

            date_match = re.search(r'Decision Date[:\s]*(\d{1,2}\s+\w+\s+\d{4})', card.get_text())
            decision_date = date_match.group(1) if date_match else None

            case_num_match = re.search(r'(?:HC|DC|MC|FC|CA|MA|AD|OS|S|B|DCA|RAS)/\S+', card.get_text())
            case_number = case_num_match.group(0) if case_num_match else None

            subject_match = re.search(r'\[([^\]]+)\]', card.get_text())
            subject = subject_match.group(1) if subject_match else None

            entries.append({
                "raw_citation": raw_citation,
                "case_name": text if len(text) > 5 else None,
                "decision_date": decision_date,
                "case_number": case_number,
                "subject": subject,
                "url": f"{BASE_URL}/gdviewer/s/{raw_citation}",
            })

    return entries


def get_total_pages(html):
    """Extract total page count from listing page."""
    soup = BeautifulSoup(html, "html.parser")

    last_link = soup.find("a", string=re.compile(r"Last|»"))
    if last_link and last_link.get("href"):
        page_match = re.search(r'CurrentPage=(\d+)', last_link["href"])
        if page_match:
            return int(page_match.group(1))

    total_match = re.search(r'Total Judgment\(s\) Found\s*:\s*([\d,]+)', html)
    if total_match:
        total = int(total_match.group(1).replace(",", ""))
        return (total + ITEMS_PER_PAGE - 1) // ITEMS_PER_PAGE

    return 1


def discover_all_citations(session, out_dir, cp, cp_path, year_filter=None, delay=2):
    """Crawl listing pages to discover all judgment citations."""
    all_discovered = {e["raw_citation"] for e in cp.get("discovered", [])}
    years = [year_filter] if year_filter else YEARS

    for year in years:
        if str(year) in cp.get("years_done", []):
            log.info(f"[{year}] Already done, skipping")
            continue

        start_page = cp.get("year_pages", {}).get(str(year), 0) + 1
        log.info(f"[{year}] Starting from page {start_page}")

        url = f"{LISTING_URL}?Filter=SUPCT&YearOfDecision={year}&SortBy=DateOfDecision&CurrentPage={start_page}&SortAscending=False"
        r = fetch_with_retry(session, url)
        if not r:
            log.error(f"[{year}] Failed to fetch first page")
            continue

        total_pages = get_total_pages(r.text)
        entries = parse_listing_page(r.text)
        for e in entries:
            if e["raw_citation"] not in all_discovered:
                cp["discovered"].append(e)
                all_discovered.add(e["raw_citation"])

        log.info(f"[{year}] Page {start_page}/{total_pages}, found {len(entries)} entries (total discovered: {len(all_discovered)})")
        cp["year_pages"][str(year)] = start_page
        save_checkpoint(cp_path, cp)

        for page in range(start_page + 1, total_pages + 1):
            time.sleep(delay)
            url = f"{LISTING_URL}?Filter=SUPCT&YearOfDecision={year}&SortBy=DateOfDecision&CurrentPage={page}&SortAscending=False"
            r = fetch_with_retry(session, url)
            if not r:
                log.warning(f"[{year}] Failed page {page}, stopping year")
                break

            entries = parse_listing_page(r.text)
            if not entries:
                log.info(f"[{year}] No entries on page {page}, done with year")
                break

            for e in entries:
                if e["raw_citation"] not in all_discovered:
                    cp["discovered"].append(e)
                    all_discovered.add(e["raw_citation"])

            cp["year_pages"][str(year)] = page
            if page % 10 == 0:
                save_checkpoint(cp_path, cp)
                log.info(f"[{year}] Page {page}/{total_pages}, total discovered: {len(all_discovered)}")

        cp.setdefault("years_done", []).append(str(year))
        save_checkpoint(cp_path, cp)
        log.info(f"[{year}] Done. Total discovered: {len(all_discovered)}")

    cp["listing_done"] = True
    save_checkpoint(cp_path, cp)
    log.info(f"Discovery complete: {len(all_discovered)} total citations")


# ============================================================
# Phase 2: Download full judgment HTML
# ============================================================

def parse_judgment_html(html):
    """Extract structured data from a judgment page."""
    soup = BeautifulSoup(html, "html.parser")
    data = {}

    title_el = soup.find("h2") or soup.find("h1") or soup.find("title")
    if title_el:
        data["case_name"] = title_el.get_text(strip=True)

    body = soup.find("div", class_=re.compile(r"judgment|content|body", re.I))
    if not body:
        body = soup.find("main") or soup.find("article") or soup.body
    if body:
        data["full_text"] = body.get_text(separator="\n", strip=True)

    text = soup.get_text()

    coram_match = re.search(r'(?:Coram|Before)[:\s]*([^\n]+)', text)
    if coram_match:
        data["coram"] = coram_match.group(1).strip()

    counsel_parts = []
    for pat in [r'(?:Counsel|Solicitors?)\s+(?:for|representing)\s+[^:]*:\s*([^\n]+)',
                r'(?:Plaintiff|Appellant|Applicant)[^:]*:\s*([^\n]+)',
                r'(?:Defendant|Respondent)[^:]*:\s*([^\n]+)']:
        for m in re.finditer(pat, text, re.I):
            counsel_parts.append(m.group(0).strip())
    if counsel_parts:
        data["counsel"] = "; ".join(counsel_parts)

    date_match = re.search(r'(?:Decision|Judgment)\s+(?:Date|Reserved)[:\s]*(\d{1,2}\s+\w+\s+\d{4})', text)
    if date_match:
        data["decision_date_str"] = date_match.group(1)

    parties_match = re.search(r'Between\s+(.+?)(?:\s+And\s+|\s+v\s+)(.+?)(?:\n|$)', text, re.I | re.DOTALL)
    if parties_match:
        data["parties"] = f"{parties_match.group(1).strip()} v {parties_match.group(2).strip()}"

    return data


def download_one(session, entry, html_dir, delay):
    """Download a single judgment HTML."""
    raw_cit = entry["raw_citation"]
    safe_name = raw_cit + ".html"
    out_path = html_dir / safe_name

    if out_path.exists() and out_path.stat().st_size > 500:
        return raw_cit, True, 0, "cached"

    time.sleep(delay)

    url = f"{BASE_URL}/gdviewer/s/{raw_cit}"
    r = fetch_with_retry(session, url)
    if not r or len(r.text) < 500:
        return raw_cit, False, 0, "fetch_failed"

    out_path.write_text(r.text, encoding="utf-8")
    return raw_cit, True, len(r.text), "downloaded"


def download_all(session, out_dir, cp, cp_path, workers=4, delay=3):
    """Download all discovered judgments."""
    html_dir = out_dir / "html"
    html_dir.mkdir(parents=True, exist_ok=True)

    downloaded_set = set(cp.get("downloaded", []))
    failed_set = set(cp.get("failed", []))
    pending = [e for e in cp["discovered"] if e["raw_citation"] not in downloaded_set]

    log.info(f"Downloading: {len(pending)} pending, {len(downloaded_set)} already done, {len(failed_set)} failed")

    total_bytes = 0
    done_count = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(download_one, get_session(), entry, html_dir, delay): entry
            for entry in pending
        }

        for fut in as_completed(futures):
            entry = futures[fut]
            raw_cit, success, size, status = fut.result()
            done_count += 1

            if success:
                cp["downloaded"].append(raw_cit)
                total_bytes += size
                if status == "downloaded":
                    log.info(f"  [{done_count}/{len(pending)}] {raw_cit} — {size:,} bytes")
            else:
                cp["failed"].append(raw_cit)
                log.warning(f"  [{done_count}/{len(pending)}] {raw_cit} — FAILED")

            if done_count % 50 == 0:
                save_checkpoint(cp_path, cp)

    save_checkpoint(cp_path, cp)
    log.info(f"Download complete: {len(cp['downloaded'])} ok, {len(cp['failed'])} failed, {total_bytes/1024/1024:.1f} MB")


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Download Singapore court decisions from eLitigation")
    parser.add_argument("--out-dir", type=str, default=os.environ.get("OUT_DIR", "/home/ubuntu/opendata/singapore"))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--delay", type=float, default=3.0, help="Delay between requests (seconds)")
    parser.add_argument("--year", type=int, default=None, help="Only scrape a specific year")
    parser.add_argument("--skip-discovery", action="store_true", help="Skip listing discovery, download only")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cp_path = out_dir / "checkpoint.json"

    session = get_session()
    cp = load_checkpoint(cp_path)

    if not args.skip_discovery:
        log.info("Phase 1: Discovering citations from listing pages...")
        discover_all_citations(session, out_dir, cp, cp_path, year_filter=args.year, delay=args.delay)

    log.info(f"Phase 2: Downloading {len(cp['discovered'])} judgment HTML files...")
    download_all(session, out_dir, cp, cp_path, workers=args.workers, delay=args.delay)

    log.info("Done!")
    log.info(f"  Discovered: {len(cp['discovered'])}")
    log.info(f"  Downloaded: {len(cp['downloaded'])}")
    log.info(f"  Failed:     {len(cp['failed'])}")


if __name__ == "__main__":
    main()
