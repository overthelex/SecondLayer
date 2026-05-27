#!/usr/bin/env python3
"""Import LV (424K) and BE (5.7K) court decisions: PDF→text extraction + DB import."""

import os
import sys
import json
import subprocess
import hashlib
import tempfile
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ["DATABASE_URL"]
BATCH_SIZE = 500


def pdf_to_text(pdf_path):
    try:
        result = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(pdf_path), "-"],
            capture_output=True, timeout=30
        )
        text = result.stdout.decode("utf-8", errors="replace").replace("\x00", "")
        return text if len(text) > 50 else None
    except Exception:
        return None


# ============================================================
# LATVIA
# ============================================================

def extract_lv_batch(pdf_ids_chunk):
    """Extract text from a batch of LV PDFs. Returns list of (file_id, text)."""
    pdf_dir = Path("/home/ubuntu/opendata/baltics/latvia/pdfs")
    results = []
    for fid in pdf_ids_chunk:
        pdf_path = pdf_dir / f"{fid}.pdf"
        if pdf_path.exists():
            text = pdf_to_text(pdf_path)
            results.append((fid, text))
        else:
            results.append((fid, None))
    return results


def import_latvia(workers=20):
    print("=== Latvia: PDF→text + DB import ===", flush=True)

    meta_dir = Path("/home/ubuntu/opendata/baltics/latvia/metadata")
    pdf_dir = Path("/home/ubuntu/opendata/baltics/latvia/pdfs")

    # Load all metadata
    items = []
    for f in sorted(meta_dir.glob("*.jsonl")):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                items.append(json.loads(line))
    print(f"  Loaded {len(items):,} metadata records", flush=True)

    # Build file_id → item mapping
    file_map = {}
    for item in items:
        for mf in item.get("materialFiles", []):
            fid = mf.get("id", "")
            if fid:
                file_map[fid] = item

    # Get list of PDFs that exist on disk
    existing_pdfs = set()
    for p in pdf_dir.iterdir():
        if p.suffix == ".pdf":
            existing_pdfs.add(p.stem)

    to_extract = [fid for fid in file_map if fid in existing_pdfs]
    print(f"  {len(to_extract):,} PDFs to extract ({len(existing_pdfs):,} on disk)", flush=True)

    # Extract text in parallel
    chunk_size = max(1, len(to_extract) // (workers * 4))
    chunks = [to_extract[i:i + chunk_size] for i in range(0, len(to_extract), chunk_size)]

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0
    with_text = 0
    rows = []

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(extract_lv_batch, chunk): i for i, chunk in enumerate(chunks)}
        for fut in as_completed(futures):
            results = fut.result()
            for fid, text in results:
                item = file_map.get(fid, {})
                ecli = item.get("ecliCode")
                case_num = item.get("caseNumber", "")
                inst = item.get("institution", {})
                court_name = inst.get("name", "") if isinstance(inst, dict) else ""
                proc_type = item.get("processType", {})
                case_type = proc_type.get("name", "") if isinstance(proc_type, dict) else ""
                mat_type = item.get("materialType", {})
                decision_type = mat_type.get("name", "") if isinstance(mat_type, dict) else ""

                reg_date = item.get("registrationDate")
                decision_date = None
                if reg_date and isinstance(reg_date, (int, float)) and reg_date > 0:
                    try:
                        decision_date = datetime.fromtimestamp(reg_date).strftime("%Y-%m-%d")
                    except (ValueError, OSError):
                        pass

                rec_id = f"lv-{fid}"
                rows.append((
                    rec_id,
                    "elieta.lv",
                    court_name,
                    case_num,
                    item.get("processSubType", {}).get("name", "") if isinstance(item.get("processSubType"), dict) else "",
                    case_type,
                    decision_date,
                    text,
                    f"https://gateway.elieta.lv/api/v1/PublicMaterialDownload/{fid}",
                    0,
                    json.dumps({
                        "ecli": ecli,
                        "applicationNumber": item.get("applicationNumber"),
                        "materialType": decision_type,
                        "materialStatus": item.get("materialStatus", {}).get("name", "") if isinstance(item.get("materialStatus"), dict) else "",
                    }, ensure_ascii=False),
                ))

                if text:
                    with_text += 1
                total += 1

                if len(rows) >= BATCH_SIZE:
                    _insert_lv(cur, rows)
                    conn.commit()
                    rows = []

            if total % 10000 < chunk_size:
                print(f"  LV: {total:,} processed, {with_text:,} with text", flush=True)

    if rows:
        _insert_lv(cur, rows)
        conn.commit()

    conn.close()
    print(f"  Latvia done: {total:,} imported, {with_text:,} with text", flush=True)


def _insert_lv(cur, rows):
    sql = """INSERT INTO lv_court_decisions (
        id, source, court_name, case_number, instance, case_type,
        decision_date, full_text, source_url, pdf_id, metadata_json
    ) VALUES %s ON CONFLICT (id) DO NOTHING"""
    execute_values(cur, sql, rows, page_size=BATCH_SIZE)


# ============================================================
# BELGIUM
# ============================================================

def import_belgium(workers=8):
    print("\n=== Belgium: PDF→text + DB import ===", flush=True)

    cc_dir = Path("/home/ubuntu/opendata/western-europe/belgium/constitutional")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0
    rows = []

    for year_dir in sorted(cc_dir.iterdir()):
        if not year_dir.is_dir():
            continue
        year = year_dir.name

        pdfs = sorted(year_dir.glob("*.pdf"))
        for pdf in pdfs:
            text = pdf_to_text(pdf)

            # Parse filename: 2024-001.pdf
            parts = pdf.stem.split("-")
            num = parts[1] if len(parts) > 1 else ""
            decision_num = f"{year}/{num}"

            rec_id = f"be-cc-{year}-{num}"
            ecli = f"ECLI:BE:GHCC:{year}:ARR.{num}"

            rows.append((
                rec_id,
                ecli,
                "const-court.be",
                "Cour constitutionnelle / Grondwettelijk Hof",
                "fr",
                decision_num,
                "Arrêt",
                f"{year}-01-01",  # approximate
                None,
                text,
                f"https://www.const-court.be/public/f/{year}/{year}-{num}f.pdf",
                json.dumps({"year": year, "number": num}, ensure_ascii=False),
            ))

            if len(rows) >= BATCH_SIZE:
                _insert_be(cur, rows)
                conn.commit()
                rows = []

            total += 1

        print(f"  BE CC {year}: {len(pdfs)} decisions", flush=True)

    if rows:
        _insert_be(cur, rows)
        conn.commit()

    conn.close()
    print(f"  Belgium done: {total:,} imported", flush=True)


def _insert_be(cur, rows):
    sql = """INSERT INTO be_court_decisions (
        id, ecli, source, court_name, language, case_number,
        decision_type, decision_date, summary, full_text,
        source_url, metadata_json
    ) VALUES %s ON CONFLICT (id) DO NOTHING"""
    execute_values(cur, sql, rows, page_size=BATCH_SIZE)


# ============================================================
# MAIN
# ============================================================

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "lv"):
        import_latvia(workers=20)

    if mode in ("all", "be"):
        import_belgium(workers=8)

    print("\n=== PDF imports done ===", flush=True)


if __name__ == "__main__":
    main()
