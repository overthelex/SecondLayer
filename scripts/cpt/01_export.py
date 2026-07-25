#!/usr/bin/env python3
"""
Stage 1: Export court decisions and legislation from PostgreSQL to parquet.

Usage:
  python3 scripts/cpt/01_export.py --output-dir /data/cpt-pipeline/01_raw --workers 4
  python3 scripts/cpt/01_export.py --output-dir /data/cpt-pipeline/01_raw --source edrsr --years 2020-2026
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import psycopg2
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).parent))
from utils.db import MAIN_DB, OPENREYESTR_DB, EDRSR_YEARS, JUSTICE_KINDS, get_connection
from utils.parquet_utils import EDRSR_SCHEMA, LEGISLATION_SCHEMA, GENERIC_SCHEMA

SHARD_SIZE = 500_000
CURSOR_BATCH = 50_000


def export_edrsr_year(year: int, output_dir: str, db_config: dict) -> dict:
    conn = psycopg2.connect(**db_config)
    conn.set_session(readonly=True)

    year_dir = os.path.join(output_dir, "edrsr")
    os.makedirs(year_dir, exist_ok=True)

    query = f"""
        SELECT f.doc_id, f.full_text, f.justice_kind,
               d.judgment_code, d.adjudication_date::text, d.court_code
        FROM edrsr_fulltext_p_{year} f
        LEFT JOIN edrsr_documents_p_{year} d ON d.doc_id = f.doc_id
        WHERE f.full_text IS NOT NULL AND length(f.full_text) > 0
    """

    cur = conn.cursor(name=f"edrsr_export_{year}")
    cur.itersize = CURSOR_BATCH
    cur.execute(query)

    rows_buf = []
    shard_idx = 0
    total_rows = 0
    total_chars = 0

    for row in cur:
        doc_id, full_text, justice_kind, judgment_code, adj_date, court_code = row
        text_len = len(full_text) if full_text else 0
        rows_buf.append({
            "doc_id": doc_id, "full_text": full_text, "text_length": text_len,
            "adj_year": year, "justice_kind": justice_kind or 0,
            "judgment_code": judgment_code or 0, "adjudication_date": adj_date or "",
            "court_code": court_code or 0, "source": "edrsr",
        })
        total_chars += text_len
        total_rows += 1

        if len(rows_buf) >= SHARD_SIZE:
            _write_shard(rows_buf, EDRSR_SCHEMA, year_dir, f"edrsr_{year}", shard_idx)
            shard_idx += 1
            rows_buf = []

    if rows_buf:
        _write_shard(rows_buf, EDRSR_SCHEMA, year_dir, f"edrsr_{year}", shard_idx)
        shard_idx += 1

    cur.close()
    conn.close()

    stats = {"year": year, "rows": total_rows, "shards": shard_idx,
             "total_chars": total_chars, "avg_chars": total_chars // max(total_rows, 1)}
    print(f"  [EDRSR {year}] {total_rows:,} docs, {shard_idx} shards, avg {stats['avg_chars']:,} chars")
    return stats


def export_rada_legislation(output_dir: str, db_config: dict) -> dict:
    conn = get_connection(db_config)
    leg_dir = os.path.join(output_dir, "legislation")
    os.makedirs(leg_dir, exist_ok=True)

    cur = conn.cursor()
    cur.execute("""
        SELECT id::text, title, COALESCE(full_text_plain, full_text_html) as full_text, law_type, status
        FROM rada.legislation
        WHERE COALESCE(full_text_plain, full_text_html) IS NOT NULL
          AND length(COALESCE(full_text_plain, full_text_html)) > 100
    """)

    rows_buf = []
    total = 0
    for row in cur:
        doc_id, title, full_text, law_type, status = row
        rows_buf.append({
            "doc_id": doc_id, "full_text": full_text, "text_length": len(full_text),
            "title": title or "", "source": f"rada_{law_type or 'legislation'}",
        })
        total += 1

    if rows_buf:
        _write_shard_generic(rows_buf, LEGISLATION_SCHEMA, leg_dir, "rada_legislation", 0)

    cur.close()
    conn.close()
    print(f"  [RADA legislation] {total:,} docs")
    return {"source": "rada_legislation", "rows": total}


def export_echr(output_dir: str, db_config: dict) -> dict:
    conn = get_connection(db_config)
    echr_dir = os.path.join(output_dir, "echr")
    os.makedirs(echr_dir, exist_ok=True)

    cur = conn.cursor()
    cur.execute("SELECT docname, full_text FROM echr_cases WHERE full_text IS NOT NULL AND length(full_text) > 100")

    rows_buf = []
    total = 0
    for row in cur:
        docname, full_text = row
        rows_buf.append({
            "doc_id": docname or str(total), "full_text": full_text,
            "text_length": len(full_text), "source": "echr",
            "metadata": json.dumps({"docname": docname}),
        })
        total += 1

    if rows_buf:
        _write_shard_generic(rows_buf, GENERIC_SCHEMA, echr_dir, "echr", 0)

    cur.close()
    conn.close()
    print(f"  [ECHR] {total:,} docs")
    return {"source": "echr", "rows": total}


def export_openreyestr_legal_acts(output_dir: str, db_config: dict) -> dict:
    conn = get_connection(db_config)
    or_dir = os.path.join(output_dir, "openreyestr")
    os.makedirs(or_dir, exist_ok=True)

    cur = conn.cursor(name="or_legal_acts")
    cur.itersize = 10_000
    cur.execute("SELECT id::text, title, full_text FROM legal_acts WHERE full_text IS NOT NULL AND length(full_text) > 50")

    rows_buf = []
    total = 0
    for row in cur:
        doc_id, title, full_text = row
        rows_buf.append({
            "doc_id": doc_id, "full_text": full_text, "text_length": len(full_text),
            "title": title or "", "source": "openreyestr_legal_acts",
        })
        total += 1

    if rows_buf:
        _write_shard_generic(rows_buf, LEGISLATION_SCHEMA, or_dir, "or_legal_acts", 0)

    cur.close()
    conn.close()
    print(f"  [OpenReyestr legal_acts] {total:,} docs")
    return {"source": "openreyestr_legal_acts", "rows": total}


def _write_shard(rows, schema, directory, prefix, idx):
    arrays = {field.name: [r[field.name] for r in rows] for field in schema}
    table = pa.table(arrays, schema=schema)
    pq.write_table(table, os.path.join(directory, f"{prefix}_{idx:05d}.parquet"), compression="zstd")


def _write_shard_generic(rows, schema, directory, prefix, idx):
    arrays = {field.name: [r.get(field.name, "") for r in rows] for field in schema}
    table = pa.table(arrays, schema=schema)
    pq.write_table(table, os.path.join(directory, f"{prefix}_{idx:05d}.parquet"), compression="zstd")


def main():
    parser = argparse.ArgumentParser(description="Stage 1: Export to parquet")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--source", default="all")
    parser.add_argument("--years", default=None)
    parser.add_argument("--db-port", type=int, default=None)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    db_config = dict(MAIN_DB)
    if args.db_port:
        db_config["port"] = args.db_port

    years = EDRSR_YEARS
    if args.years:
        parts = args.years.split("-")
        years = list(range(int(parts[0]), int(parts[1]) + 1))

    sources = args.source.split(",") if "," in args.source else [args.source]
    if "all" in sources:
        sources = ["edrsr", "rada", "echr", "openreyestr"]

    all_stats = {}
    t0 = time.time()

    if "edrsr" in sources:
        print(f"Exporting EDRSR: {len(years)} years, {args.workers} workers")
        edrsr_stats = []
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(export_edrsr_year, y, args.output_dir, db_config): y for y in years}
            for future in as_completed(futures):
                year = futures[future]
                try:
                    edrsr_stats.append(future.result())
                except Exception as e:
                    print(f"  [EDRSR {year}] FAILED: {e}")
        total_edrsr = sum(s["rows"] for s in edrsr_stats)
        total_chars = sum(s["total_chars"] for s in edrsr_stats)
        print(f"EDRSR total: {total_edrsr:,} docs, {total_chars:,} chars")
        all_stats["edrsr"] = {"total_rows": total_edrsr, "total_chars": total_chars,
                              "years": sorted(edrsr_stats, key=lambda s: s["year"])}

    if "rada" in sources:
        all_stats["rada"] = export_rada_legislation(args.output_dir, db_config)
    if "echr" in sources:
        all_stats["echr"] = export_echr(args.output_dir, db_config)
    if "openreyestr" in sources:
        or_config = dict(OPENREYESTR_DB)
        if args.db_port:
            or_config["port"] = args.db_port + 3
        all_stats["openreyestr"] = export_openreyestr_legal_acts(args.output_dir, or_config)

    elapsed = time.time() - t0
    print(f"\nStage 1 complete in {elapsed/60:.1f} min")
    with open(os.path.join(args.output_dir, "export_stats.json"), "w") as f:
        json.dump(all_stats, f, indent=2, default=str)


if __name__ == "__main__":
    main()
