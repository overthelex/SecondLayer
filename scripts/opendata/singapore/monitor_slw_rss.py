#!/usr/bin/env python3
"""
Monitor Singapore Law Watch RSS feed for new judgments.

Polls the RSS feed, downloads new judgment PDFs and extracts text.
Designed to run as a cron job (e.g. daily).

Usage:
    python monitor_slw_rss.py [--out-dir DIR] [--import-db]
"""

import argparse
import json
import os
import re
import sys
import time
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote
import xml.etree.ElementTree as ET

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("sg-slw-rss")

RSS_URL = "https://www.singaporelawwatch.sg/Portals/0/RSS/Judgments.xml"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}

CITATION_RE = re.compile(r'\[?(\d{4})\]?\s+(SG\w+)\s+(\d+)')


def parse_rss(xml_text):
    """Parse SLW RSS feed."""
    root = ET.fromstring(xml_text)
    items = []

    for item in root.iter("item"):
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        desc = item.findtext("description", "").strip()
        pub_date = item.findtext("pubDate", "").strip()

        subject_match = re.match(r'^(.+?)\s*\|\s*Decision Date:\s*(.+)$', desc)
        subject = subject_match.group(1).strip() if subject_match else desc
        decision_date = subject_match.group(2).strip() if subject_match else None

        citation_match = CITATION_RE.search(link) or CITATION_RE.search(title)
        citation = None
        court_code = None
        year = None
        if citation_match:
            year = citation_match.group(1)
            court_code = citation_match.group(2)
            num = citation_match.group(3)
            citation = f"[{year}] {court_code} {num}"

        items.append({
            "title": title,
            "pdf_url": link,
            "citation": citation,
            "court_code": court_code,
            "year": year,
            "subject": subject,
            "decision_date": decision_date,
            "pub_date": pub_date,
        })

    return items


def download_pdf(session, url, out_path, max_retries=3):
    """Download a PDF file."""
    for attempt in range(max_retries):
        try:
            r = session.get(url, timeout=120)
            if r.status_code == 200 and len(r.content) > 1000:
                out_path.write_bytes(r.content)
                return True
            time.sleep((attempt + 1) * 3)
        except requests.exceptions.RequestException:
            time.sleep((attempt + 1) * 5)
    return False


def extract_text_from_pdf(pdf_path):
    """Extract text from PDF using pdftotext (poppler) or fallback."""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0 and len(result.stdout) > 100:
            return result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(pdf_path))
        text = "\n\n".join(page.get_text() for page in doc)
        doc.close()
        if len(text) > 100:
            return text
    except ImportError:
        pass

    return None


def load_seen(state_path):
    if state_path.exists():
        return json.loads(state_path.read_text())
    return {"seen_citations": [], "last_poll": None}


def save_seen(state_path, state):
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Monitor Singapore Law Watch RSS for new judgments")
    parser.add_argument("--out-dir", type=str, default=os.environ.get("OUT_DIR", "/home/ubuntu/opendata/singapore"))
    parser.add_argument("--import-db", action="store_true", help="Import new decisions to database")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    pdf_dir = out_dir / "pdf"
    text_dir = out_dir / "text"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    state_path = out_dir / "rss_state.json"
    state = load_seen(state_path)
    seen = set(state.get("seen_citations", []))

    session = requests.Session()
    session.headers.update(HEADERS)

    log.info("Fetching SLW RSS feed...")
    r = session.get(RSS_URL, timeout=60)
    if r.status_code != 200:
        log.error(f"RSS fetch failed: HTTP {r.status_code}")
        sys.exit(1)

    items = parse_rss(r.text)
    log.info(f"RSS feed has {len(items)} items")

    new_items = [it for it in items if it["citation"] and it["citation"] not in seen]
    log.info(f"New items: {len(new_items)}")

    imported = []
    for i, item in enumerate(new_items):
        cit = item["citation"]
        safe_name = cit.replace("[", "").replace("]", "").replace(" ", "_")

        pdf_path = pdf_dir / f"{safe_name}.pdf"
        if not pdf_path.exists():
            log.info(f"  [{i+1}/{len(new_items)}] Downloading {cit}...")
            ok = download_pdf(session, item["pdf_url"], pdf_path)
            if not ok:
                log.warning(f"  Failed to download {cit}")
                continue
            time.sleep(1)
        else:
            log.info(f"  [{i+1}/{len(new_items)}] {cit} PDF already exists")

        text_path = text_dir / f"{safe_name}.txt"
        if not text_path.exists():
            text = extract_text_from_pdf(pdf_path)
            if text:
                text_path.write_text(text, encoding="utf-8")
                log.info(f"    Extracted {len(text):,} chars")
            else:
                log.warning(f"    Text extraction failed for {cit}")

        seen.add(cit)
        imported.append(item)

    state["seen_citations"] = list(seen)
    state["last_poll"] = datetime.utcnow().isoformat()
    save_seen(state_path, state)

    if args.import_db and imported:
        log.info(f"Importing {len(imported)} new decisions to DB...")
        import_to_db(imported, text_dir)

    log.info(f"Done. {len(imported)} new, {len(seen)} total seen.")


def import_to_db(items, text_dir):
    """Import RSS-sourced decisions to PostgreSQL."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        log.warning("DATABASE_URL not set, skipping DB import")
        return

    import psycopg2
    from psycopg2.extras import execute_values

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    rows = []
    for item in items:
        cit = item["citation"]
        safe_name = cit.replace("[", "").replace("]", "").replace(" ", "_")
        text_path = text_dir / f"{safe_name}.txt"
        full_text = text_path.read_text(encoding="utf-8") if text_path.exists() else None

        citation_match = CITATION_RE.search(cit)
        raw_cit = f"{citation_match.group(1)}_{citation_match.group(2)}_{citation_match.group(3)}" if citation_match else None

        decision_date = None
        if item.get("decision_date"):
            try:
                decision_date = datetime.strptime(item["decision_date"], "%d %B %Y").strftime("%Y-%m-%d")
            except ValueError:
                pass

        rows.append((
            f"sg-slw-{raw_cit or cit}",
            cit,
            "slw-rss",
            item.get("court_code"),
            item.get("court_code"),
            None,
            item.get("title"),
            None,
            decision_date,
            None,
            item.get("subject"),
            None,
            None,
            None,
            None,
            None,
            full_text,
            f"https://www.elitigation.sg/gdviewer/s/{raw_cit}" if raw_cit else None,
            item.get("pdf_url"),
            json.dumps({"pub_date": item.get("pub_date")}, ensure_ascii=False),
        ))

    if rows:
        sql = """INSERT INTO sg_court_decisions (
            id, neutral_citation, source, court_name, court_code,
            case_number, case_name, decision_type, decision_date,
            judge, subject, keywords, parties, coram, counsel,
            abstract, full_text, source_url, pdf_url, metadata_json
        ) VALUES %s ON CONFLICT (id) DO UPDATE SET
            full_text = EXCLUDED.full_text,
            updated_at = NOW()
        WHERE sg_court_decisions.full_text IS NULL AND EXCLUDED.full_text IS NOT NULL"""
        execute_values(cur, sql, rows, page_size=100)
        conn.commit()
        log.info(f"  DB: {cur.rowcount} rows upserted")

    conn.close()


if __name__ == "__main__":
    main()
