#!/usr/bin/env python3
"""
Import Indian court metadata from parquet files (S3 or local) into PostgreSQL.

Creates tables:
  - indian_sc_judgments  (Supreme Court)
  - indian_hc_judgments  (High Courts)

Optimized: COPY via temp table + vectorized pandas ops + concurrent S3 prefetch.

Usage:
  python import-metadata-to-db.py --source supreme-court --years 2024
  python import-metadata-to-db.py --source high-courts --years 2024 --courts 27_1
  python import-metadata-to-db.py --source all
"""

import argparse
import csv
import io
import logging
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from queue import Queue, Empty
from threading import Thread

import boto3
import pyarrow.parquet as pq
import numpy as np
import pandas as pd
import psycopg2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("india-import")

SOURCE_REGION = "ap-south-1"
DEST_REGION = "eu-central-1"
DEST_BUCKET = "lexai-corpus-india-judgments"

SC_SOURCE_BUCKET = "indian-supreme-court-judgments"
HC_SOURCE_BUCKET = "indian-high-court-judgments"

SC_TABLE = "indian_sc_judgments"
HC_TABLE = "indian_hc_judgments"

PREFETCH_WORKERS = 4

CREATE_SC_TABLE = f"""
CREATE TABLE IF NOT EXISTS {SC_TABLE} (
    id SERIAL PRIMARY KEY,
    title TEXT,
    petitioner TEXT,
    respondent TEXT,
    description TEXT,
    judge TEXT,
    author_judge TEXT,
    citation TEXT,
    case_id TEXT,
    cnr TEXT,
    decision_date DATE,
    disposal_nature TEXT,
    court TEXT,
    available_languages TEXT,
    path TEXT,
    nc_display TEXT,
    scraped_at TIMESTAMPTZ,
    year INTEGER,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cnr, case_id)
);

CREATE INDEX IF NOT EXISTS idx_{SC_TABLE}_year ON {SC_TABLE}(year);
CREATE INDEX IF NOT EXISTS idx_{SC_TABLE}_decision_date ON {SC_TABLE}(decision_date);
CREATE INDEX IF NOT EXISTS idx_{SC_TABLE}_cnr ON {SC_TABLE}(cnr);
CREATE INDEX IF NOT EXISTS idx_{SC_TABLE}_judge ON {SC_TABLE}(judge);
"""

CREATE_HC_TABLE = f"""
CREATE TABLE IF NOT EXISTS {HC_TABLE} (
    id SERIAL PRIMARY KEY,
    court_code TEXT,
    title TEXT,
    description TEXT,
    judge TEXT,
    pdf_link TEXT,
    cnr TEXT,
    date_of_registration DATE,
    decision_date DATE,
    disposal_nature TEXT,
    court TEXT,
    pdf_exists BOOLEAN,
    year INTEGER,
    bench TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cnr, court_code)
);

CREATE INDEX IF NOT EXISTS idx_{HC_TABLE}_year ON {HC_TABLE}(year);
CREATE INDEX IF NOT EXISTS idx_{HC_TABLE}_decision_date ON {HC_TABLE}(decision_date);
CREATE INDEX IF NOT EXISTS idx_{HC_TABLE}_cnr ON {HC_TABLE}(cnr);
CREATE INDEX IF NOT EXISTS idx_{HC_TABLE}_court ON {HC_TABLE}(court);
CREATE INDEX IF NOT EXISTS idx_{HC_TABLE}_court_code ON {HC_TABLE}(court_code);
"""

SC_COLS = [
    "title", "petitioner", "respondent", "description", "judge", "author_judge",
    "citation", "case_id", "cnr", "decision_date", "disposal_nature", "court",
    "available_languages", "path", "nc_display", "scraped_at", "year",
]

HC_COLS = [
    "court_code", "title", "description", "judge", "pdf_link", "cnr",
    "date_of_registration", "decision_date", "disposal_nature", "court",
    "pdf_exists", "year", "bench",
]


BULK_MODE = False


def get_db_connection():
    opts = "-c statement_timeout=600000"
    if BULK_MODE:
        opts += " -c synchronous_commit=off -c work_mem=256MB -c maintenance_work_mem=512MB"
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=opts,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )


def get_source_client():
    from botocore import UNSIGNED
    from botocore.config import Config
    return boto3.client("s3", region_name=SOURCE_REGION, config=Config(signature_version=UNSIGNED))


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute(CREATE_SC_TABLE)
        cur.execute(CREATE_HC_TABLE)
    conn.commit()
    log.info("Tables ensured: %s, %s", SC_TABLE, HC_TABLE)


def vectorized_date_parse(series):
    """Parse dates vectorized -- 100x faster than row-by-row."""
    if series.dtype == "datetime64[ns]" or pd.api.types.is_datetime64_any_dtype(series):
        return pd.to_datetime(series, errors="coerce").dt.date
    result = pd.to_datetime(series, format="%d-%m-%Y", errors="coerce")
    mask = result.isna() & series.notna()
    if mask.any():
        result[mask] = pd.to_datetime(series[mask], format="%Y-%m-%d", errors="coerce")
    mask2 = result.isna() & series.notna()
    if mask2.any():
        result[mask2] = pd.to_datetime(series[mask2], format="%d/%m/%Y", errors="coerce")
    return result.dt.date


def df_to_csv_buffer(df, columns):
    """Convert DataFrame to CSV StringIO for COPY -- avoids row-by-row iteration."""
    buf = io.StringIO()
    subset = df[columns].copy()
    subset.to_csv(buf, index=False, header=False, na_rep="\\N", quoting=csv.QUOTE_MINIMAL)
    buf.seek(0)
    return buf


def copy_upsert(conn, df, target_table, columns, conflict_cols, update_cols):
    """Bulk load via COPY to temp table + INSERT ON CONFLICT. 5-10x faster than execute_values."""
    tmp_table = f"_tmp_{target_table}_{os.getpid()}"
    col_defs = ", ".join(columns)
    conflict_def = ", ".join(conflict_cols)
    update_set = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)

    buf = df_to_csv_buffer(df, columns)

    with conn.cursor() as cur:
        cur.execute(f"CREATE TEMP TABLE {tmp_table} (LIKE {target_table} INCLUDING DEFAULTS) ON COMMIT DROP")
        cur.execute(f"ALTER TABLE {tmp_table} DROP COLUMN IF EXISTS id")
        cur.execute(f"ALTER TABLE {tmp_table} DROP COLUMN IF EXISTS imported_at")

        cur.copy_expert(
            f"COPY {tmp_table} ({col_defs}) FROM STDIN WITH (FORMAT csv, NULL '\\N')",
            buf,
        )

        cur.execute(f"""
            INSERT INTO {target_table} ({col_defs})
            SELECT {col_defs} FROM {tmp_table}
            ON CONFLICT ({conflict_def}) DO UPDATE SET
                {update_set},
                imported_at = NOW()
        """)
        inserted = cur.rowcount

    conn.commit()
    return inserted


def prepare_sc_df(parquet_path, year):
    """Load and prepare SC dataframe -- all vectorized, no iterrows."""
    df = pd.read_parquet(parquet_path, columns=[c for c in [
        "title", "petitioner", "respondent", "description", "judge", "author_judge",
        "citation", "case_id", "cnr", "decision_date", "disposal_nature", "court",
        "available_languages", "path", "nc_display", "scraped_at", "year",
    ]])

    if "year" not in df.columns:
        df["year"] = year
    df["year"] = pd.to_numeric(df["year"], errors="coerce").fillna(int(year)).astype(int)

    df["decision_date"] = vectorized_date_parse(df["decision_date"])
    if "scraped_at" in df.columns:
        df["scraped_at"] = pd.to_datetime(df["scraped_at"], errors="coerce")

    df = df.astype(object).where(df.notna(), None)
    before = len(df)
    df = df.drop_duplicates(subset=["cnr", "case_id"], keep="last")
    if len(df) < before:
        log.info("SC year=%s: deduplicated %d -> %d", year, before, len(df))

    return df


def prepare_hc_df(parquet_path, year, court_code=None, bench=None):
    """Load and prepare HC dataframe -- all vectorized, no iterrows."""
    df = pd.read_parquet(parquet_path)
    if "raw_html" in df.columns:
        df = df.drop(columns=["raw_html"])

    if "court_code" not in df.columns:
        df["court_code"] = court_code
    df["year"] = int(year)
    df["bench"] = bench

    df["decision_date"] = vectorized_date_parse(df["decision_date"])
    if "date_of_registration" in df.columns:
        df["date_of_registration"] = vectorized_date_parse(df["date_of_registration"])
    else:
        df["date_of_registration"] = None

    if "pdf_exists" in df.columns:
        df["pdf_exists"] = df["pdf_exists"].astype(object).where(df["pdf_exists"].notna(), None)
    else:
        df["pdf_exists"] = None

    for col in HC_COLS:
        if col not in df.columns:
            df[col] = None

    df = df.astype(object).where(df.notna(), None)
    before = len(df)
    if "court_code" in df.columns:
        df = df.drop_duplicates(subset=["cnr", "court_code"], keep="last")
    if len(df) < before:
        log.info("HC year=%s court=%s: deduplicated %d -> %d", year, court_code, before, len(df))

    return df


def import_sc_parquet(conn, parquet_path, year):
    t0 = time.time()
    df = prepare_sc_df(parquet_path, year)
    log.info("SC year=%s: %d rows (prepared in %.1fs)", year, len(df), time.time() - t0)

    n = copy_upsert(
        conn, df, SC_TABLE, SC_COLS,
        conflict_cols=["cnr", "case_id"],
        update_cols=["title", "decision_date", "disposal_nature", "scraped_at"],
    )
    log.info("SC year=%s: upserted %d rows (%.1fs total)", year, n, time.time() - t0)
    return n


def import_hc_parquet(conn, parquet_path, year, court_code=None, bench=None):
    t0 = time.time()
    df = prepare_hc_df(parquet_path, year, court_code, bench)
    log.info("HC year=%s court=%s bench=%s: %d rows (prepared in %.1fs)",
             year, court_code, bench, len(df), time.time() - t0)

    n = copy_upsert(
        conn, df, HC_TABLE, HC_COLS,
        conflict_cols=["cnr", "court_code"],
        update_cols=["title", "decision_date", "disposal_nature", "pdf_exists"],
    )
    log.info("HC year=%s court=%s bench=%s: upserted %d rows (%.1fs total)",
             year, court_code, bench, n, time.time() - t0)
    return n


def download_parquet(s3_client, bucket, key):
    tmp = tempfile.NamedTemporaryFile(suffix=".parquet", delete=False)
    s3_client.download_file(bucket, key, tmp.name)
    return tmp.name


def prefetch_parquets(s3_client, bucket, items, max_workers=PREFETCH_WORKERS):
    """Download parquets concurrently, yield (local_path, metadata) as they complete."""
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {}
        for item in items:
            key = item[0]
            fut = pool.submit(download_parquet, s3_client, bucket, key)
            futures[fut] = item

        for fut in as_completed(futures):
            item = futures[fut]
            try:
                local_path = fut.result()
                yield (local_path, *item)
            except Exception as e:
                log.error("Download failed %s: %s", item[0], e)


def discover_sc_parquets(s3_client, years=None):
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=SC_SOURCE_BUCKET, Prefix="metadata/parquet/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".parquet"):
                continue
            year = extract_year_from_key(key)
            if years and year not in years:
                continue
            yield key, year


def discover_hc_parquets(s3_client, years=None, courts=None):
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=HC_SOURCE_BUCKET, Prefix="metadata/parquet/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".parquet"):
                continue
            year = extract_year_from_key(key)
            if years and year not in years:
                continue
            court = extract_court_from_key(key)
            if courts and court not in courts:
                continue
            bench = extract_bench_from_key(key)
            yield key, year, court, bench


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


def parse_years(years_str):
    if not years_str:
        return None
    if "-" in years_str:
        start, end = years_str.split("-", 1)
        return [str(y) for y in range(int(start), int(end) + 1)]
    return [years_str]


HC_SEARCH_INDEXES = [
    ("idx_indian_hc_judgments_year", f"CREATE INDEX idx_{{HC_TABLE}}_year ON {HC_TABLE}(year)"),
    ("idx_indian_hc_judgments_decision_date", f"CREATE INDEX idx_{{HC_TABLE}}_decision_date ON {HC_TABLE}(decision_date)"),
    ("idx_indian_hc_judgments_cnr", f"CREATE INDEX idx_{{HC_TABLE}}_cnr ON {HC_TABLE}(cnr)"),
    ("idx_indian_hc_judgments_court", f"CREATE INDEX idx_{{HC_TABLE}}_court ON {HC_TABLE}(court)"),
    ("idx_indian_hc_judgments_court_code", f"CREATE INDEX idx_{{HC_TABLE}}_court_code ON {HC_TABLE}(court_code)"),
    ("idx_indian_hc_title_trgm", f"CREATE INDEX idx_indian_hc_title_trgm ON {HC_TABLE} USING gin (title gin_trgm_ops)"),
    ("idx_indian_hc_judge_trgm", f"CREATE INDEX idx_indian_hc_judge_trgm ON {HC_TABLE} USING gin (judge gin_trgm_ops)"),
    ("idx_indian_hc_court_trgm", f"CREATE INDEX idx_indian_hc_court_trgm ON {HC_TABLE} USING gin (court gin_trgm_ops)"),
]

SC_SEARCH_INDEXES = [
    ("idx_indian_sc_title_trgm", f"CREATE INDEX idx_indian_sc_title_trgm ON {SC_TABLE} USING gin (title gin_trgm_ops)"),
    ("idx_indian_sc_petitioner_trgm", f"CREATE INDEX idx_indian_sc_petitioner_trgm ON {SC_TABLE} USING gin (petitioner gin_trgm_ops)"),
    ("idx_indian_sc_respondent_trgm", f"CREATE INDEX idx_indian_sc_respondent_trgm ON {SC_TABLE} USING gin (respondent gin_trgm_ops)"),
]


def drop_search_indexes(conn, table):
    indexes = HC_SEARCH_INDEXES if table == HC_TABLE else SC_SEARCH_INDEXES
    with conn.cursor() as cur:
        for idx_name, _ in indexes:
            cur.execute(f"DROP INDEX IF EXISTS {idx_name}")
            log.info("Dropped index %s", idx_name)
    conn.commit()


def rebuild_search_indexes(conn, table):
    indexes = HC_SEARCH_INDEXES if table == HC_TABLE else SC_SEARCH_INDEXES
    for idx_name, create_sql in indexes:
        t0 = time.time()
        log.info("Creating index %s ...", idx_name)
        with conn.cursor() as cur:
            cur.execute(f"SET maintenance_work_mem = '1GB'")
            cur.execute(f"DROP INDEX IF EXISTS {idx_name}")
            cur.execute(create_sql)
        conn.commit()
        log.info("Created %s in %.1fs", idx_name, time.time() - t0)


def main():
    global BULK_MODE
    parser = argparse.ArgumentParser(description="Import Indian court metadata into PostgreSQL")
    parser.add_argument("--source", choices=["supreme-court", "high-courts", "all"], default="all")
    parser.add_argument("--years", type=str, help="Year or range: 2024 or 2020-2025")
    parser.add_argument("--courts", type=str, help="Comma-separated court IDs (HC only)")
    parser.add_argument("--database-url", type=str, help="Override DATABASE_URL env var")
    parser.add_argument("--prefetch", type=int, default=PREFETCH_WORKERS, help="Concurrent S3 downloads")
    parser.add_argument("--bulk-mode", action="store_true",
                        help="Drop indexes before import, rebuild after. 3-5x faster for large imports.")
    parser.add_argument("--rebuild-indexes-only", action="store_true",
                        help="Only rebuild search indexes, no import.")
    args = parser.parse_args()

    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    if "DATABASE_URL" not in os.environ:
        log.error("DATABASE_URL not set. Pass --database-url or export DATABASE_URL.")
        sys.exit(1)

    BULK_MODE = args.bulk_mode

    conn = get_db_connection()
    ensure_tables(conn)
    conn.close()

    if args.rebuild_indexes_only:
        conn = get_db_connection()
        sources = ["supreme-court", "high-courts"] if args.source == "all" else [args.source]
        if "high-courts" in sources:
            rebuild_search_indexes(conn, HC_TABLE)
        if "supreme-court" in sources:
            rebuild_search_indexes(conn, SC_TABLE)
        conn.close()
        log.info("Index rebuild complete.")
        return

    if BULK_MODE:
        conn = get_db_connection()
        sources_list = ["supreme-court", "high-courts"] if args.source == "all" else [args.source]
        if "high-courts" in sources_list:
            log.info("BULK MODE: dropping HC search indexes")
            drop_search_indexes(conn, HC_TABLE)
        if "supreme-court" in sources_list:
            log.info("BULK MODE: dropping SC search indexes")
            drop_search_indexes(conn, SC_TABLE)
        conn.close()

    s3 = get_source_client()
    years = parse_years(args.years)
    courts = args.courts.split(",") if args.courts else None
    sources = ["supreme-court", "high-courts"] if args.source == "all" else [args.source]

    total = 0
    errors = []
    t_start = time.time()

    if "supreme-court" in sources:
        log.info("=== Importing Supreme Court metadata ===")
        items = list(discover_sc_parquets(s3, years))
        log.info("Found %d SC parquet files", len(items))
        for local_path, key, year in prefetch_parquets(s3, SC_SOURCE_BUCKET, items, args.prefetch):
            try:
                conn = get_db_connection()
                total += import_sc_parquet(conn, local_path, year)
                conn.close()
            except Exception as e:
                log.error("FAILED %s: %s", key, e)
                errors.append((key, str(e)))
                try:
                    conn.close()
                except Exception:
                    pass
            finally:
                os.unlink(local_path)

    if "high-courts" in sources:
        log.info("=== Importing High Courts metadata ===")
        items = list(discover_hc_parquets(s3, years, courts))
        log.info("Found %d HC parquet files", len(items))
        for local_path, key, year, court, bench in prefetch_parquets(s3, HC_SOURCE_BUCKET, items, args.prefetch):
            try:
                conn = get_db_connection()
                total += import_hc_parquet(conn, local_path, year, court, bench)
                conn.close()
            except Exception as e:
                log.error("FAILED %s: %s", key, e)
                errors.append((key, str(e)))
                try:
                    conn.close()
                except Exception:
                    pass
            finally:
                os.unlink(local_path)

    elapsed = time.time() - t_start
    rate = total / elapsed if elapsed > 0 else 0
    log.info("=== DONE: %d rows in %.0fs (%.0f rows/s) ===", total, elapsed, rate)
    if errors:
        log.error("=== %d ERRORS ===", len(errors))
        for key, err in errors:
            log.error("  %s: %s", key, err)

    if BULK_MODE:
        log.info("BULK MODE: rebuilding search indexes...")
        conn = get_db_connection()
        if "high-courts" in sources:
            rebuild_search_indexes(conn, HC_TABLE)
        if "supreme-court" in sources:
            rebuild_search_indexes(conn, SC_TABLE)
        conn.close()
        log.info("Index rebuild complete.")


if __name__ == "__main__":
    main()
