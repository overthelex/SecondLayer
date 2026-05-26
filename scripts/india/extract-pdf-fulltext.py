#!/usr/bin/env python3
"""
Extract full text from PDF files inside Indian court data tar archives.

Downloads data/tar/ from source S3 bucket, extracts PDFs with pymupdf,
stores plain text in indian_court_fulltext table.

Multi-threaded: workers download+extract tars in parallel, DB writer batches inserts.

Usage:
  python extract-pdf-fulltext.py --source supreme-court --workers 8
  python extract-pdf-fulltext.py --source high-courts --years 2024 --workers 10
  python extract-pdf-fulltext.py --source all
"""

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import tarfile
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue

import boto3
import fitz
import psycopg2
from botocore import UNSIGNED
from botocore.config import Config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("pdf-extract")

SOURCE_REGION = "ap-south-1"
MIRROR_REGION = "eu-central-1"
HC_BUCKET = "indian-high-court-judgments"
SC_BUCKET = "indian-supreme-court-judgments"
MIRROR_BUCKET = "lexai-corpus-india-judgments"

DEFAULT_WORKERS = 8
DB_BATCH_SIZE = 2000
SENTINEL = None

TABLE = "indian_court_fulltext"
COLS = ["cnr", "source", "court_code", "court_name", "bench", "year", "full_text", "text_length", "pdf_link"]

USE_MIRROR = False
_thread_s3 = threading.local()


def get_s3():
    if not hasattr(_thread_s3, "client"):
        if USE_MIRROR:
            _thread_s3.client = boto3.client("s3", region_name=MIRROR_REGION)
        else:
            _thread_s3.client = boto3.client(
                "s3", region_name=SOURCE_REGION, config=Config(signature_version=UNSIGNED)
            )
    return _thread_s3.client


def cnr_from_pdf_name(name):
    base = os.path.basename(name).replace(".pdf", "")
    return base


def extract_year_from_key(key):
    for part in key.split("/"):
        if part.startswith("year="):
            return part.split("=")[1]
    return None


def extract_court_from_key(key):
    for part in key.split("/"):
        if part.startswith("court="):
            return part.split("=")[1]
    return None


def extract_bench_from_key(key):
    for part in key.split("/"):
        if part.startswith("bench="):
            return part.split("=")[1]
    return None


def pdf_to_text(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    text = text.replace("\x00", "")
    return re.sub(r"\s+", " ", text).strip()


def _mirror_prefix(source_bucket):
    if source_bucket == SC_BUCKET:
        return "supreme-court/data/tar/"
    return "high-courts/data/tar/"


def discover_data_tars(bucket, years=None, courts=None):
    if USE_MIRROR:
        s3 = boto3.client("s3", region_name=MIRROR_REGION)
        prefix = _mirror_prefix(bucket)
        scan_bucket = MIRROR_BUCKET
    else:
        s3 = boto3.client("s3", region_name=SOURCE_REGION, config=Config(signature_version=UNSIGNED))
        prefix = "data/tar/"
        scan_bucket = bucket
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=scan_bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".tar"):
                continue
            year = extract_year_from_key(key)
            if years and year not in years:
                continue
            court = extract_court_from_key(key)
            if courts and court not in courts:
                continue
            yield key, year, court, obj["Size"]


def process_tar(bucket, key, year, court, source_label, existing_cnrs, result_queue):
    s3 = get_s3()
    bench = extract_bench_from_key(key)
    batch = []
    pdf_count = 0
    skip_count = 0
    BATCH_FLUSH = 500
    actual_bucket = MIRROR_BUCKET if USE_MIRROR else bucket

    try:
        resp = s3.get_object(Bucket=actual_bucket, Key=key)
        body = resp["Body"]
        tf = tarfile.open(fileobj=body, mode="r|*")

        for member in tf:
            if not member.isfile() or not member.name.endswith(".pdf"):
                continue
            if member.size < 100:
                tf.members = []
                continue

            cnr = cnr_from_pdf_name(member.name)
            if not cnr:
                tf.members = []
                continue

            cnr_key = (cnr, source_label)
            existing_len = existing_cnrs.get(cnr_key, 0)
            if existing_len > 1000:
                skip_count += 1
                tf.members = []
                continue

            try:
                f = tf.extractfile(member)
                if f is None:
                    tf.members = []
                    continue
                pdf_data = f.read()
                f.close()
                text = pdf_to_text(pdf_data)
                del pdf_data
                if not text or len(text) < 50:
                    tf.members = []
                    continue

                pdf_count += 1
                batch.append({
                    "cnr": cnr,
                    "source": source_label,
                    "court_code": court or "",
                    "court_name": "",
                    "bench": bench or "",
                    "year": int(year) if year else None,
                    "full_text": text,
                    "text_length": len(text),
                    "pdf_link": member.name.lstrip("./"),
                })
                del text
            except Exception:
                pass

            tf.members = []

            if len(batch) >= BATCH_FLUSH:
                result_queue.put(list(batch))
                batch.clear()

        tf.close()

        if batch:
            result_queue.put(list(batch))
            batch.clear()

        log.info("EXTRACTED | %s | %s | %d PDFs, %d skipped",
                 source_label, key, pdf_count, skip_count)

    except Exception as e:
        log.error("FAILED | %s | %s: %s", source_label, key, e)
        if batch:
            result_queue.put(list(batch))
            batch.clear()

    return pdf_count


def db_writer(queue, db_url, stats, stats_lock):
    conn = psycopg2.connect(
        db_url,
        options="-c synchronous_commit=off -c work_mem=256MB",
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5,
    )
    batch = []
    last_flush = time.time()

    def flush(batch):
        if not batch:
            return 0
        seen = {}
        for row in batch:
            key = (row["cnr"], row["source"])
            seen[key] = row
        batch = list(seen.values())

        buf = io.StringIO()
        writer = csv.writer(buf)
        for row in batch:
            writer.writerow([row.get(c) or "" for c in COLS])
        buf.seek(0)

        tmp = f"_tmp_pdf_{os.getpid()}"
        with conn.cursor() as cur:
            cur.execute(f"CREATE TEMP TABLE {tmp} (LIKE {TABLE} INCLUDING DEFAULTS) ON COMMIT DROP")
            cur.execute(f"ALTER TABLE {tmp} DROP COLUMN IF EXISTS id")
            cur.execute(f"ALTER TABLE {tmp} DROP COLUMN IF EXISTS extracted_at")
            col_list = ", ".join(COLS)
            cur.copy_expert(f"COPY {tmp} ({col_list}) FROM STDIN WITH (FORMAT csv)", buf)
            cur.execute(f"""
                INSERT INTO {TABLE} ({col_list})
                SELECT {col_list} FROM {tmp}
                ON CONFLICT (cnr, source) DO UPDATE SET
                    full_text = EXCLUDED.full_text,
                    text_length = EXCLUDED.text_length,
                    extracted_at = NOW()
            """)
            inserted = cur.rowcount
        conn.commit()
        return inserted

    while True:
        item = queue.get()
        if item is SENTINEL:
            n = flush(batch)
            with stats_lock:
                stats["rows"] += n
            break
        batch.extend(item)
        if len(batch) >= DB_BATCH_SIZE or (time.time() - last_flush > 10 and batch):
            n = flush(batch)
            with stats_lock:
                stats["rows"] += n
            batch = []
            last_flush = time.time()

    conn.close()


def load_existing_cnrs(db_url, source_label):
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(f"SELECT cnr, source, text_length FROM {TABLE} WHERE source = %s AND text_length > 1000", (source_label,))
        result = {}
        for row in cur:
            result[(row[0], row[1])] = row[2]
    conn.close()
    log.info("Loaded %d existing CNRs for %s (text > 1000 chars, will skip)", len(result), source_label)
    return result


PROGRESS_TABLE = "_india_pdf_progress"

PROGRESS_DDL = f"""
CREATE TABLE IF NOT EXISTS {PROGRESS_TABLE} (
    tar_key TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    year INTEGER,
    court_code TEXT,
    pdfs_extracted INTEGER DEFAULT 0,
    status TEXT DEFAULT 'done',
    completed_at TIMESTAMPTZ DEFAULT NOW()
);
"""


def load_completed_tars(db_url):
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(f"SELECT tar_key FROM {PROGRESS_TABLE} WHERE status = 'done'")
        result = {row[0] for row in cur}
    conn.close()
    return result


def mark_tar_done(db_url, key, source_label, year, court, pdf_count):
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(f"""
            INSERT INTO {PROGRESS_TABLE} (tar_key, source, year, court_code, pdfs_extracted, status, completed_at)
            VALUES (%s, %s, %s, %s, %s, 'done', NOW())
            ON CONFLICT (tar_key) DO UPDATE SET pdfs_extracted = EXCLUDED.pdfs_extracted, status = 'done', completed_at = NOW()
        """, (key, source_label, int(year) if year else None, court, pdf_count))
    conn.commit()
    conn.close()


def run_extraction(bucket, source_label, years=None, courts=None, workers=DEFAULT_WORKERS, db_url=None):
    log.info("Discovering %s data tars...", source_label)
    items = list(discover_data_tars(bucket, years=years, courts=courts))
    total_size = sum(sz for _, _, _, sz in items) / 1024**3
    log.info("Found %d data tar files for %s (%.1f GB)", len(items), source_label, total_size)

    if not items:
        return 0

    # Ensure progress table exists
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(PROGRESS_DDL)
    conn.commit()
    conn.close()

    completed = load_completed_tars(db_url)
    before = len(items)
    items = [(k, y, c, s) for k, y, c, s in items if k not in completed]
    if before != len(items):
        log.info("Resuming: %d tars already done, %d remaining", before - len(items), len(items))

    if not items:
        log.info("All tars already processed for %s", source_label)
        return 0

    existing_cnrs = load_existing_cnrs(db_url, source_label)

    stats = {"rows": 0, "tars": 0, "errors": 0}
    stats_lock = threading.Lock()

    queue = Queue(maxsize=workers * 2)
    writer_thread = threading.Thread(
        target=db_writer, args=(queue, db_url, stats, stats_lock), daemon=True
    )
    writer_thread.start()

    t0 = time.time()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {}
        for key, year, court, size in items:
            fut = pool.submit(process_tar, bucket, key, year, court, source_label, existing_cnrs, queue)
            futures[fut] = (key, year, court, size)

        for fut in as_completed(futures):
            key, year, court, size = futures[fut]
            try:
                pdf_count = fut.result()
                mark_tar_done(db_url, key, source_label, year, court, pdf_count)
                with stats_lock:
                    stats["tars"] += 1
                    if stats["tars"] % 10 == 0:
                        elapsed = time.time() - t0
                        log.info(
                            "PROGRESS | %s | tars=%d/%d rows=%d | %.1f min elapsed",
                            source_label, stats["tars"], len(items), stats["rows"],
                            elapsed / 60,
                        )
            except Exception as e:
                log.error("Error %s: %s", key, e)
                with stats_lock:
                    stats["errors"] += 1

    queue.put(SENTINEL)
    writer_thread.join()

    elapsed = time.time() - t0
    log.info(
        "DONE | %s | tars=%d rows=%d errors=%d | %.0fs (%.0f rows/s)",
        source_label, stats["tars"], stats["rows"], stats["errors"],
        elapsed, stats["rows"] / elapsed if elapsed > 0 else 0,
    )
    return stats["rows"]


def parse_years(years_str):
    if not years_str:
        return None
    if "-" in years_str:
        start, end = years_str.split("-", 1)
        return [str(y) for y in range(int(start), int(end) + 1)]
    return [years_str]


def main():
    global USE_MIRROR
    parser = argparse.ArgumentParser(description="Extract full text from PDF tars")
    parser.add_argument("--source", choices=["supreme-court", "high-courts", "all"], default="all")
    parser.add_argument("--years", type=str, help="Year or range: 2024 or 2020-2025")
    parser.add_argument("--courts", type=str, help="Comma-separated court IDs (HC only)")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--database-url", type=str)
    parser.add_argument("--from-mirror", action="store_true",
                        help="Read from eu-central-1 mirror bucket (lexai-corpus-india-judgments) instead of source buckets")
    args = parser.parse_args()

    USE_MIRROR = args.from_mirror
    if USE_MIRROR:
        log.info("Using mirror bucket %s in %s", MIRROR_BUCKET, MIRROR_REGION)

    db_url = args.database_url or os.environ.get("DATABASE_URL")
    if not db_url:
        log.error("DATABASE_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_name = '{TABLE}'")
        if cur.fetchone()[0] == 0:
            log.info("Creating table %s...", TABLE)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS indian_court_fulltext (
                    id SERIAL PRIMARY KEY,
                    cnr TEXT NOT NULL,
                    source TEXT NOT NULL,
                    court_code TEXT,
                    court_name TEXT,
                    bench TEXT,
                    year INTEGER,
                    full_text TEXT,
                    text_length INTEGER,
                    pdf_link TEXT,
                    extracted_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(cnr, source)
                )
            """)
            conn.commit()
    conn.close()

    years = parse_years(args.years)
    courts = args.courts.split(",") if args.courts else None
    sources = ["supreme-court", "high-courts"] if args.source == "all" else [args.source]
    total = 0

    if "supreme-court" in sources:
        total += run_extraction(SC_BUCKET, "sc", years, courts, args.workers, db_url)

    if "high-courts" in sources:
        total += run_extraction(HC_BUCKET, "hc", years, courts, args.workers, db_url)

    log.info("=== TOTAL: %d PDF full texts extracted ===", total)


if __name__ == "__main__":
    main()
