#!/usr/bin/env python3
"""
Import downloaded eLitigation HTML files into PostgreSQL.

Reads the HTML files saved by download_elitigation.py, extracts structured
metadata and full text, and bulk-inserts into sg_court_decisions.

Usage:
    python import_to_db.py [--html-dir DIR] [--batch-size N]
"""

import argparse
import json
import os
import re
import sys
import time
import logging
from datetime import datetime
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

import psycopg2
from psycopg2.extras import execute_values
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("sg-import")

DB_URL = os.environ.get("DATABASE_URL")
BATCH_SIZE = 200

COURT_CODES = {
    "SGCA": "Court of Appeal",
    "SGHC": "High Court (General Division)",
    "SGHCA": "High Court (Appellate Division)",
    "SGHCI": "Singapore International Commercial Court",
    "SGHCF": "High Court (Family Division)",
    "SGHCR": "High Court (Registrar)",
    "SGDC": "District Court",
    "SGMC": "Magistrates' Court",
    "SGFC": "Family Court",
    "SGSCT": "Small Claims Tribunal",
    "SGCDT": "Community Disputes Resolution Tribunal",
    "SGCAI": "Court of Appeal (International)",
}


def clean(v):
    if isinstance(v, str):
        return v.replace("\x00", "").strip() or None
    return v


def parse_date(date_str):
    if not date_str:
        return None
    for fmt in ["%d %B %Y", "%d %b %Y", "%Y-%m-%d", "%d/%m/%Y"]:
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def extract_court_code(raw_citation):
    """Extract court code from raw citation like 2026_SGHC_115."""
    match = re.match(r'\d{4}_([A-Z]+(?:\([A-Z]\))?)', raw_citation)
    if match:
        return match.group(1).replace("(", "").replace(")", "")
    return None


def format_neutral_citation(raw_citation):
    """Convert 2026_SGHC_115 to [2026] SGHC 115."""
    match = re.match(r'(\d{4})_(\w+)_(\d+)', raw_citation)
    if match:
        return f"[{match.group(1)}] {match.group(2)} {match.group(3)}"
    return raw_citation


def parse_html_file(html_path):
    """Parse a single eLitigation HTML file into a structured record."""
    raw_citation = html_path.stem
    html = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator="\n")

    court_code_raw = extract_court_code(raw_citation)
    court_code = court_code_raw
    for code in COURT_CODES:
        if court_code_raw and court_code_raw.startswith(code):
            court_code = code
            break

    case_name = None
    cn_el = soup.find("div", class_=re.compile(r'HN-CaseName', re.I))
    if cn_el:
        t = cn_el.get_text(" ", strip=True)
        if not re.match(r'^\[?\d{4}\]?\s+SG', t):
            t = re.sub(r'\s+', ' ', t)
            t = re.sub(r'(?<=[a-z])v(?=[A-Z])', ' v ', t)
            case_name = t
    if not case_name:
        title_el = soup.find("title")
        if title_el:
            t = title_el.get_text(strip=True)
            t = re.sub(r'\s*[-|]\s*SG Courts.*$', '', t).strip()
            if len(t) > 5 and not re.match(r'^\[?\d{4}\]?\s+SG', t):
                case_name = t

    # Decision date — first try structured HTML elements, then regex fallback
    decision_date = None
    for cls in ["Judg-Date-Reserved", "Judg-Date-Hearing", "Decision-Date"]:
        date_el = soup.find("div", class_=re.compile(cls, re.I))
        if date_el:
            decision_date = parse_date(date_el.get_text(strip=True))
            if decision_date:
                break
    if not decision_date:
        date_match = re.search(r'Decision Date[:\s]*(\d{1,2}\s+\w+\s+\d{4})', text)
        if date_match:
            decision_date = parse_date(date_match.group(1))
    if not decision_date:
        date_match2 = re.search(r'Judgment (?:reserved on|date)[:\s]*(\d{1,2}\s+\w+\s+\d{4})', text, re.I)
        if date_match2:
            decision_date = parse_date(date_match2.group(1))

    # Case number
    case_number = None
    cn_match = re.search(r'(?:Originating |Tribunal |Magistrate.s Appeal |Criminal (?:Motion|Appeal|Case|Reference) |'
                         r'(?:HC|DC|MC|FC|CA|AD|OS|S|B|DCA|RAS|SUM|OA|SS|MCA|CWU|BOC)/)\S+', text)
    if cn_match:
        case_number = cn_match.group(0).strip()

    # Judge / Coram — structured element first
    coram = None
    judge = None
    judge_el = soup.find("div", class_=re.compile(r'Judg-Author', re.I))
    if judge_el:
        j = judge_el.get_text(strip=True).rstrip(":")
        coram = j
        judge = j
    if not coram:
        coram_match = re.search(r'(?:Coram|Before)[:\s]*([^\n]+)', text)
        if coram_match:
            coram = coram_match.group(1).strip()
            judge = coram

    # Counsel — structured elements first
    counsel = None
    counsel_els = soup.find_all("div", class_=re.compile(r'Judg-Lawyers', re.I))
    if counsel_els:
        counsel = "; ".join(el.get_text(strip=True) for el in counsel_els if el.get_text(strip=True))
    if not counsel:
        counsel_parts = []
        for m in re.finditer(r'(?:Counsel|Solicitors?)\s+(?:for|representing)\s+[^:]*:\s*([^\n]+)', text, re.I):
            counsel_parts.append(m.group(0).strip())
        if counsel_parts:
            counsel = "; ".join(counsel_parts[:4])

    # Parties
    parties = None
    parties_match = re.search(r'Between\s+(.+?)\s+(?:\.\.\.\s+)?(?:And|[Vv])\s+(.+?)(?:\n|$)', text, re.I)
    if parties_match:
        p1 = parties_match.group(1).strip().rstrip(".")
        p2 = parties_match.group(2).strip().rstrip(".")
        parties = f"{p1} v {p2}"

    # Subject / keywords from bracketed tags
    subjects = re.findall(r'\[([A-Z][^\]]{3,80})\]', text[:2000])
    subject = "; ".join(subjects[:5]) if subjects else None
    keywords = subjects if subjects else None

    # Full text: the main content container holds the judgment
    body_div = soup.find("div", class_=re.compile(r'container.*body-content', re.I))
    if not body_div or len(body_div.get_text()) < 500:
        body_div = soup.find("div", class_=re.compile(r'judgment|contentsOfFile', re.I))
    if body_div:
        full_text = body_div.get_text(separator="\n", strip=True)
    else:
        full_text = text

    if len(full_text) < 200:
        return None

    neutral_citation = format_neutral_citation(raw_citation)
    year_match = re.match(r'(\d{4})', raw_citation)
    year = year_match.group(1) if year_match else None

    return {
        "id": f"sg-elit-{raw_citation}",
        "neutral_citation": neutral_citation,
        "source": "elitigation",
        "court_name": COURT_CODES.get(court_code, court_code),
        "court_code": court_code,
        "case_number": clean(case_number),
        "case_name": clean(case_name),
        "decision_type": None,
        "decision_date": decision_date,
        "judge": clean(judge),
        "subject": clean(subject),
        "keywords": keywords,
        "parties": clean(parties),
        "coram": clean(coram),
        "counsel": clean(counsel),
        "abstract": None,
        "full_text": clean(full_text),
        "source_url": f"https://www.elitigation.sg/gdviewer/s/{raw_citation}",
        "pdf_url": f"https://www.elitigation.sg/gdviewer/gd/{raw_citation}/pdf",
        "metadata_json": json.dumps({"year": year, "raw_citation": raw_citation}, ensure_ascii=False),
    }


def process_file(path_str):
    """Wrapper for multiprocessing."""
    try:
        return parse_html_file(Path(path_str))
    except Exception as e:
        return None


def load_checkpoint_metadata(out_dir):
    """Load discovery checkpoint to supplement HTML-parsed metadata."""
    cp_path = Path(out_dir) / "checkpoint.json"
    if not cp_path.exists():
        return {}
    cp = json.loads(cp_path.read_text())
    meta = {}
    for entry in cp.get("discovered", []):
        raw = entry.get("raw_citation")
        if raw:
            meta[raw] = entry
    return meta


def main():
    parser = argparse.ArgumentParser(description="Import eLitigation HTML to PostgreSQL")
    parser.add_argument("--html-dir", type=str,
                        default=os.environ.get("HTML_DIR", "/home/ubuntu/opendata/singapore/html"))
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--workers", type=int, default=os.cpu_count() or 4)
    args = parser.parse_args()

    if not DB_URL:
        log.error("DATABASE_URL not set")
        sys.exit(1)

    html_dir = Path(args.html_dir)
    files = sorted(html_dir.glob("*.html"))
    log.info(f"Found {len(files)} HTML files in {html_dir}")

    if not files:
        log.warning("No files to import")
        return

    # Load checkpoint metadata for gap-filling (dates, case names from listing pages)
    cp_meta = load_checkpoint_metadata(html_dir.parent)
    log.info(f"Checkpoint metadata: {len(cp_meta)} entries")

    conn = psycopg2.connect(DB_URL, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
    cur = conn.cursor()

    cur.execute("SELECT neutral_citation FROM sg_court_decisions WHERE source = 'elitigation'")
    existing = {r[0] for r in cur.fetchall()}
    log.info(f"Already in DB: {existing and len(existing) or 0}")

    total_imported = 0
    total_skipped = 0
    total_failed = 0

    file_paths = [str(f) for f in files]

    # Pre-filter: only parse files not already in DB to avoid long idle connection
    pending_paths = []
    for f in files:
        raw_cit = f.stem
        neutral = format_neutral_citation(raw_cit)
        if neutral not in existing:
            pending_paths.append(str(f))
        else:
            total_skipped += 1
    file_paths = pending_paths
    log.info(f"Skipped {total_skipped} already in DB, parsing {len(file_paths)} new files...")

    log.info(f"Parsing HTML files with {args.workers} workers...")
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        batch = []
        for i, record in enumerate(pool.map(process_file, file_paths, chunksize=50)):
            if record is None:
                total_failed += 1
                continue

            # Merge in checkpoint metadata for fields the HTML parser missed
            raw_cit = json.loads(record["metadata_json"]).get("raw_citation", "")
            if raw_cit in cp_meta:
                meta = cp_meta[raw_cit]
                if not record["decision_date"] and meta.get("decision_date"):
                    record["decision_date"] = parse_date(meta["decision_date"])
                if not record["case_name"] and meta.get("case_name"):
                    record["case_name"] = meta["case_name"]
                if not record["subject"] and meta.get("subject"):
                    record["subject"] = meta["subject"]

            batch.append(record)

            if len(batch) >= args.batch_size:
                inserted = insert_batch(cur, batch)
                conn.commit()
                total_imported += inserted
                log.info(f"  [{i+1}/{len(file_paths)}] Imported {total_imported:,}, skipped {total_skipped:,}, failed {total_failed:,}")
                batch = []

        if batch:
            inserted = insert_batch(cur, batch)
            conn.commit()
            total_imported += inserted

    conn.close()
    log.info(f"Import complete: {total_imported:,} imported, {total_skipped:,} skipped, {total_failed:,} failed")


def insert_batch(cur, records):
    rows = []
    for r in records:
        rows.append((
            r["id"], r["neutral_citation"], r["source"], r["court_name"], r["court_code"],
            r["case_number"], r["case_name"], r["decision_type"], r["decision_date"],
            r["judge"], r["subject"], r["keywords"], r["parties"], r["coram"],
            r["counsel"], r["abstract"], r["full_text"], r["source_url"], r["pdf_url"],
            r["metadata_json"],
        ))

    sql = """INSERT INTO sg_court_decisions (
        id, neutral_citation, source, court_name, court_code,
        case_number, case_name, decision_type, decision_date,
        judge, subject, keywords, parties, coram, counsel,
        abstract, full_text, source_url, pdf_url, metadata_json
    ) VALUES %s ON CONFLICT (id) DO NOTHING"""

    execute_values(cur, sql, rows, page_size=200)
    return cur.rowcount


if __name__ == "__main__":
    main()
