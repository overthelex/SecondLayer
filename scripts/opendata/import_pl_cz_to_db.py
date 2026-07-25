#!/usr/bin/env python3
"""Import Polish and Czech court decisions into PostgreSQL (parallel)."""

import json
import os
import sys
import csv
import zipfile
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from io import StringIO

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("DATABASE_URL", "postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_prod")
MAX_WORKERS = 20
BATCH_SIZE = 500

PL_BASE = Path("/home/ubuntu/opendata/poland")
CZ_BASE = Path("/home/ubuntu/opendata/czech")


def get_conn():
    return psycopg2.connect(DB_URL)


# ============================================================
# POLAND: SAOS API JSON files
# ============================================================

def parse_saos_item(item: dict) -> tuple:
    saos_id = str(item.get("id", ""))
    court_cases = item.get("courtCases", [])
    case_number = court_cases[0]["caseNumber"] if court_cases else None
    judges_list = item.get("judges", [])
    judge = judges_list[0]["name"] if judges_list else None
    source_info = item.get("source", {}) or {}

    return (
        f"saos-{saos_id}",                                     # id
        None,                                                    # ecli
        "saos",                                                  # source
        item.get("courtType"),                                   # court_type
        (item.get("division", {}) or {}).get("court", {}).get("name") if item.get("division") else None,
        (item.get("division", {}) or {}).get("name") if item.get("division") else None,
        case_number,
        item.get("judgmentType"),                                # decision_type
        item.get("judgmentDate"),                                # decision_date
        judge,
        json.dumps(judges_list) if judges_list else None,       # judges
        item.get("keywords") or None,                           # keywords
        [lb.get("text", lb) if isinstance(lb, dict) else lb for lb in item.get("legalBases", [])] or None,
        json.dumps(item.get("referencedRegulations")) if item.get("referencedRegulations") else None,
        None,                                                    # parties
        item.get("summary"),                                     # abstract
        item.get("textContent"),                                 # full_text
        source_info.get("judgmentUrl"),                          # source_url
        json.dumps({
            "publicationDate": source_info.get("publicationDate"),
            "publisher": source_info.get("publisher"),
            "reviser": source_info.get("reviser"),
        }),
    )


def import_saos_file(filepath: str) -> int:
    path = Path(filepath)
    with open(path) as f:
        data = json.load(f)
    items = data.get("items", [])
    if not items:
        return 0

    rows = [parse_saos_item(item) for item in items]
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO pl_court_decisions
                    (id, ecli, source, court_type, court_name, division,
                     case_number, decision_type, decision_date, judge, judges,
                     keywords, legal_bases, referenced_regulations,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
        return len(rows)
    finally:
        conn.close()


def import_poland_saos():
    saos_dir = PL_BASE / "saos-api"
    files = sorted(saos_dir.glob("page_*.json"))
    print(f"\nPL SAOS: {len(files)} files to import")

    imported = 0
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(import_saos_file, str(f)): f.name for f in files}
        done = 0
        for future in as_completed(futures):
            fname = futures[future]
            try:
                count = future.result()
                imported += count
                done += 1
                if done % 100 == 0:
                    elapsed = time.time() - t0
                    rate = imported / elapsed
                    print(f"  SAOS: {done}/{len(files)} files | {imported} rows | {rate:.0f}/s")
            except Exception as e:
                print(f"  SAOS FAILED {fname}: {e}")

    print(f"  SAOS complete: {imported} rows in {time.time()-t0:.0f}s")
    return imported


# ============================================================
# POLAND: JuDDGES HuggingFace Parquet
# ============================================================

def import_hf_parquet_file(filepath: str, source_name: str) -> int:
    try:
        import pyarrow.parquet as pq
    except ImportError:
        print("pyarrow not installed, skipping HF parquet import")
        return 0

    table = pq.read_table(filepath)
    df_cols = table.column_names
    batch_rows = []

    for i in range(table.num_rows):
        row = {col: table.column(col)[i].as_py() for col in df_cols}

        record_id = f"hf-{source_name}-{i}-{Path(filepath).stem}"
        text = row.get("text") or row.get("content") or row.get("full_text", "")
        case_num = row.get("signature") or row.get("case_number") or row.get("caseNumber")
        court = row.get("court_name") or row.get("courtName") or row.get("court")
        court_type = row.get("court_type") or row.get("courtType")
        decision_date = row.get("date") or row.get("judgment_date") or row.get("judgmentDate")
        decision_type = row.get("type") or row.get("judgment_type") or row.get("judgmentType")
        judge_name = row.get("chairman") or row.get("judge")
        ecli = row.get("ecli")

        meta = {k: v for k, v in row.items()
                if k not in ("text", "content", "full_text", "signature", "case_number",
                             "court_name", "court_type", "date", "judgment_date", "type",
                             "judgment_type", "chairman", "judge", "ecli", "caseNumber",
                             "courtName", "courtType", "judgmentDate", "judgmentType", "court")}

        batch_rows.append((
            record_id, ecli, f"hf-{source_name}", court_type, court, None,
            case_num, decision_type,
            str(decision_date)[:10] if decision_date else None,
            judge_name, None, None, None, None, None, None,
            text, None, json.dumps(meta, default=str) if meta else None,
        ))

        if len(batch_rows) >= BATCH_SIZE:
            _flush_pl_batch(batch_rows)
            batch_rows = []

    if batch_rows:
        _flush_pl_batch(batch_rows)
    return table.num_rows


def _flush_pl_batch(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO pl_court_decisions
                    (id, ecli, source, court_type, court_name, division,
                     case_number, decision_type, decision_date, judge, judges,
                     keywords, legal_bases, referenced_regulations,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
    finally:
        conn.close()


def import_poland_hf():
    for ds_name in ("pl-court-raw", "pl-nsa"):
        ds_dir = PL_BASE / "huggingface" / ds_name
        files = sorted(ds_dir.glob("**/*.parquet"))
        if not files:
            print(f"  No parquet files in {ds_dir}")
            continue
        print(f"\nPL HF {ds_name}: {len(files)} parquet files")

        imported = 0
        t0 = time.time()
        with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(import_hf_parquet_file, str(f), ds_name): f.name for f in files}
            done = 0
            for future in as_completed(futures):
                fname = futures[future]
                try:
                    count = future.result()
                    imported += count
                    done += 1
                    elapsed = time.time() - t0
                    rate = imported / elapsed if elapsed > 0 else 0
                    print(f"  HF {ds_name}: {done}/{len(files)} files | {imported} rows | {rate:.0f}/s")
                except Exception as e:
                    print(f"  HF FAILED {fname}: {e}")

        print(f"  HF {ds_name} complete: {imported} rows in {time.time()-t0:.0f}s")


# ============================================================
# CZECH: justice.cz API JSON files
# ============================================================

def import_cz_justice_file(filepath: str) -> int:
    path = Path(filepath)
    with open(path) as f:
        items = json.load(f)
    if not items:
        return 0

    rows = []
    for item in items:
        ecli = item.get("ecli")
        record_id = ecli or f"cz-justice-{item.get('jednaciCislo','unknown')}"
        rows.append((
            record_id,
            ecli,
            "justice.cz",
            item.get("soud"),
            None,                                                # court_type
            None,                                                # chamber
            item.get("jednaciCislo"),
            None,                                                # decision_type
            item.get("datumVydani"),
            item.get("datumZverejneni"),
            item.get("autor"),
            item.get("predmetRizeni"),
            item.get("klicovaSlova") or None,
            item.get("zminenaUstanoveni") or None,
            None, None, None,                                    # parties, abstract, full_text
            item.get("odkaz"),
            None,                                                # metadata_json
        ))

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO cz_court_decisions
                    (id, ecli, source, court_name, court_type, chamber,
                     case_number, decision_type, decision_date, publication_date,
                     judge, subject, keywords, cited_provisions,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
        return len(rows)
    finally:
        conn.close()


def import_czech_justice():
    justice_dir = CZ_BASE / "justice-api"
    files = sorted(justice_dir.rglob("decisions.json"))
    print(f"\nCZ justice.cz: {len(files)} day files to import")

    imported = 0
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(import_cz_justice_file, str(f)): str(f) for f in files}
        done = 0
        for future in as_completed(futures):
            fname = futures[future]
            try:
                count = future.result()
                imported += count
                done += 1
                if done % 100 == 0:
                    elapsed = time.time() - t0
                    rate = imported / elapsed
                    print(f"  CZ justice: {done}/{len(files)} files | {imported} rows | {rate:.0f}/s")
            except Exception as e:
                print(f"  CZ FAILED {fname}: {e}")

    print(f"  CZ justice complete: {imported} rows in {time.time()-t0:.0f}s")
    return imported


# ============================================================
# CZECH: CzCDC from LINDAT (ZIPs with .txt files)
# ============================================================

def import_czcdc():
    czcdc_dir = CZ_BASE / "czcdc"
    zips = sorted(czcdc_dir.glob("*.zip"))
    if not zips:
        print("  No CzCDC ZIPs found")
        return

    court_map = {
        "ConCo": "Constitutional Court",
        "SupAdmCo": "Supreme Administrative Court",
        "SupCo": "Supreme Court",
    }

    for zf_path in zips:
        court_key = zf_path.stem
        court_name = court_map.get(court_key, court_key)
        print(f"\nCZ CzCDC {court_key}: importing from {zf_path.name}")

        csv_path = czcdc_dir / f"{court_key}.csv"
        csv_meta = {}
        if csv_path.exists():
            for enc in ("utf-8", "windows-1250", "latin-2", "iso-8859-2"):
                try:
                    with open(csv_path, encoding=enc, errors="replace") as cf:
                        reader = csv.DictReader(cf)
                        for row in reader:
                            fname = row.get("filename", "")
                            csv_meta[fname] = row
                    break
                except UnicodeDecodeError:
                    csv_meta = {}
                    continue

        batch_rows = []
        imported = 0
        t0 = time.time()

        with zipfile.ZipFile(zf_path) as zf:
            txt_files = [n for n in zf.namelist() if n.endswith(".txt")]
            print(f"  {len(txt_files)} text files")

            for txt_name in txt_files:
                text = zf.read(txt_name).decode("utf-8", errors="replace")
                base = Path(txt_name).stem
                meta = csv_meta.get(base, csv_meta.get(txt_name, {}))

                record_id = f"czcdc-{court_key}-{base}"
                ecli = meta.get("ecli")
                case_num = meta.get("docket_number") or meta.get("case_number") or base
                decision_date = meta.get("decision_date") or meta.get("date")

                batch_rows.append((
                    record_id, ecli, "czcdc", court_name, court_key, None,
                    case_num, meta.get("decision_type"), decision_date, None,
                    meta.get("judge"), meta.get("subject"),
                    None, None, None, None, text, None,
                    json.dumps(meta, default=str) if meta else None,
                ))

                if len(batch_rows) >= BATCH_SIZE:
                    _flush_cz_batch(batch_rows)
                    imported += len(batch_rows)
                    batch_rows = []

        if batch_rows:
            _flush_cz_batch(batch_rows)
            imported += len(batch_rows)

        print(f"  CzCDC {court_key} complete: {imported} rows in {time.time()-t0:.0f}s")


def _flush_cz_batch(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO cz_court_decisions
                    (id, ecli, source, court_name, court_type, chamber,
                     case_number, decision_type, decision_date, publication_date,
                     judge, subject, keywords, cited_provisions,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
    finally:
        conn.close()


# ============================================================
# Main
# ============================================================

def run_migration():
    """Run the migration SQL on the database."""
    migration_sql = Path(__file__).parent.parent.parent / "mcp_backend" / "src" / "migrations" / "151_pl_cz_court_decisions.sql"
    if not migration_sql.exists():
        migration_sql = Path("/home/ubuntu/151_pl_cz_court_decisions.sql")
    if not migration_sql.exists():
        print("Migration file not found, tables must already exist")
        return

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(migration_sql.read_text())
        conn.commit()
        print("Migration 151 applied successfully")
    finally:
        conn.close()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "migrate"):
        run_migration()

    if mode in ("all", "pl", "pl-saos"):
        import_poland_saos()
    if mode in ("all", "pl", "pl-hf"):
        import_poland_hf()
    if mode in ("all", "cz", "cz-justice"):
        import_czech_justice()
    if mode in ("all", "cz", "cz-czcdc"):
        import_czcdc()

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM pl_court_decisions")
            pl_count = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM cz_court_decisions")
            cz_count = cur.fetchone()[0]
        print(f"\n{'='*60}")
        print(f"Total: PL={pl_count:,}, CZ={cz_count:,}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
