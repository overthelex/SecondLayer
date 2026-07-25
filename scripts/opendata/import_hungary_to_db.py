#!/usr/bin/env python3
"""Import Hungarian court decisions into PostgreSQL."""

import os
import sys
import csv
import json
import hashlib
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("DATABASE_URL")
DATA_DIR = Path(os.environ.get("DATA_DIR", "/home/ubuntu/opendata/hungary"))
BATCH_SIZE = 500


def extract_text_from_docx(docx_path):
    try:
        from docx import Document
        doc = Document(docx_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs).replace("\x00", "")
    except Exception:
        return None


def import_eakta_batch(jsonl_files, docx_dir):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0
    skipped = 0

    for jsonl_file in jsonl_files:
        rows = []
        with open(jsonl_file, encoding="utf-8") as f:
            for line in f:
                item = json.loads(line)
                egyedi = item.get("EgyediAzonosito", "")
                if not egyedi:
                    skipped += 1
                    continue

                case_num = item.get("Azonosito", "")
                court = item.get("MeghozoBirosag", "")
                index_id = item.get("IndexId", "")

                docx_hash = hashlib.md5(egyedi.encode()).hexdigest()
                docx_path = docx_dir / f"{docx_hash}.docx"
                full_text = extract_text_from_docx(docx_path) if docx_path.exists() else None

                legislation_refs = []
                jogszab = item.get("Jogszabalyhelyek", "")
                if jogszab:
                    import re
                    refs = re.split(r"<br\s*/?>", jogszab)
                    legislation_refs = [r.strip() for r in refs if r.strip()]

                related = item.get("KapcsolodoHatarozatok")
                if related and not isinstance(related, list):
                    related = None

                rec_id = f"eakta-{egyedi}"
                rows.append((
                    rec_id,
                    egyedi,
                    "eakta.birosag.hu",
                    court,
                    item.get("Kollegium"),
                    item.get("JogTerulet"),
                    case_num,
                    item.get("HatarozatFajta") if "HatarozatFajta" in item else None,
                    item.get("HatarozatEve"),
                    None,  # decision_date not in search results
                    None,  # judge not available
                    None,  # subject
                    item.get("Rezume"),
                    legislation_refs if legislation_refs else None,
                    json.dumps(related, ensure_ascii=False) if related else None,
                    full_text,
                    f"https://eakta.birosag.hu/anonimizalt-hatarozatok?EgyediAzonosito={egyedi}",
                    f"https://eakta.birosag.hu/hatarozat-letoltes/?birosagName={court}&ugyszam={case_num}&azonosito={index_id}" if index_id else None,
                    index_id,
                    json.dumps(item, ensure_ascii=False),
                ))

                if len(rows) >= BATCH_SIZE:
                    _insert_batch(cur, rows)
                    total += len(rows)
                    rows = []

        if rows:
            _insert_batch(cur, rows)
            total += len(rows)

    conn.commit()
    conn.close()
    return total, skipped


def _insert_batch(cur, rows):
    sql = """
        INSERT INTO hu_court_decisions (
            id, egyedi_azonosito, source, court_name, collegium, legal_area,
            case_number, decision_type, decision_year, decision_date, judge,
            subject, summary, legislation_refs, related_cases, full_text,
            source_url, download_url, index_id, metadata_json
        ) VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    execute_values(cur, sql, rows, page_size=BATCH_SIZE)


def import_huncourt_csv(csv_path):
    print(f"Importing HUNCOURT CSV: {csv_path}", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    csv.field_size_limit(sys.maxsize)
    total = 0
    rows = []

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            decision_num = row.get("number_of_decision", "").strip()
            if not decision_num:
                continue

            year_str = row.get("year", "")
            year = int(year_str) if year_str.isdigit() else None
            full_text = row.get("text", "")
            if full_text:
                full_text = full_text.replace("\x00", "")

            rec_id = f"huncourt-{decision_num}"
            egyedi = f"HCC-{decision_num}"

            judges_all = row.get("all_participating_judges", "")
            drafting = row.get("drafting_judge", "")
            dissenting = row.get("dissenting_judges", "")
            proc_type = row.get("type_of_procedure", "")

            lawref_cc = row.get("lawref_cc", "")
            lawref_non = row.get("lawref_non_cc", "")
            refs = []
            if lawref_cc:
                refs.extend([r.strip() for r in lawref_cc.split(";") if r.strip()])
            if lawref_non:
                refs.extend([r.strip() for r in lawref_non.split(";") if r.strip()])

            meta = {
                "all_judges": judges_all,
                "drafting_judge": drafting,
                "dissenting_judges": dissenting,
                "head_judge": row.get("head_judge", ""),
                "type_of_procedure": proc_type,
                "jogtar_link": row.get("jogtar_link", ""),
                "lawref_cc_title": row.get("lawref_cc_title", ""),
                "lawref_non_cc_title": row.get("lawref_non_cc_title", ""),
            }

            rows.append((
                rec_id,
                egyedi,
                "huncourt-osf",
                "Alkotmánybíróság",
                None,  # collegium
                "alkotmányjog",
                decision_num,
                proc_type or None,
                year,
                None,  # decision_date
                drafting or None,
                row.get("title", ""),
                None,  # summary
                refs if refs else None,
                None,  # related_cases
                full_text if full_text else None,
                row.get("jogtar_link", "") or None,
                None,  # download_url
                None,  # index_id
                json.dumps(meta, ensure_ascii=False),
            ))

            if len(rows) >= BATCH_SIZE:
                _insert_batch(cur, rows)
                total += len(rows)
                rows = []
                if total % 5000 == 0:
                    conn.commit()
                    print(f"  HUNCOURT: {total:,} imported", flush=True)

    if rows:
        _insert_batch(cur, rows)
        total += len(rows)

    conn.commit()
    conn.close()
    print(f"  HUNCOURT done: {total:,} records", flush=True)
    return total


def import_cc_api(cc_dir):
    print(f"Importing CC API data from {cc_dir}", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0

    for json_file in sorted(cc_dir.glob("cc_*.json")):
        items = json.loads(json_file.read_text())
        rows = []

        for item in items:
            detail = item.get("detail") or {}
            search = item.get("search") or {}
            doc_id = item.get("doc_id", "")

            decision_num = ""
            if detail.get("hatarozatszam"):
                decision_num = detail["hatarozatszam"]
            elif search.get("sor1"):
                decision_num = search["sor1"][0] if isinstance(search["sor1"], list) else search["sor1"]

            if not decision_num:
                continue

            rec_id = f"cc-api-{doc_id or hashlib.md5(decision_num.encode()).hexdigest()}"
            egyedi = f"CC-{decision_num}"

            case_num = detail.get("ugyszam") or ""
            if isinstance(search.get("sor2"), list) and search["sor2"]:
                case_num = case_num or search["sor2"][0]

            date_str = detail.get("keltezes", "")
            judge = detail.get("eloadoBiro", "")
            title = detail.get("cim", "")
            subject = detail.get("subject_of_the_case", "")

            full_text_parts = []
            for field in ["hatarozat", "lenyege", "dontesosszefoglalo1"]:
                val = detail.get(field, "")
                if val:
                    import re
                    clean = re.sub(r"<[^>]+>", " ", val).strip()
                    if clean:
                        full_text_parts.append(clean)
            full_text = "\n\n".join(full_text_parts).replace("\x00", "") if full_text_parts else None

            summary_en = detail.get("summary", "")

            meta = {
                "doc_id": doc_id,
                "date_of_decision": detail.get("date_of_decision"),
                "number_of_decision": detail.get("number_of_decision"),
                "english_summary": summary_en,
                "fundamentalLawRef": detail.get("fundamentalLawDecisionsRef"),
                "biroiDontes": detail.get("biroiDontes"),
            }

            year = None
            if detail.get("date_of_decision"):
                try:
                    year = int(detail["date_of_decision"][:4])
                except (ValueError, TypeError):
                    pass

            rows.append((
                rec_id,
                egyedi,
                "alkotmanybirosag.hu",
                "Alkotmánybíróság",
                None,
                "alkotmányjog",
                case_num or decision_num,
                detail.get("lezaras_modja") or None,
                year,
                None,
                judge or None,
                title or subject or None,
                summary_en or None,
                None,
                None,
                full_text,
                f"https://alkotmanybirosag.hu/ugyadatlap/?id={doc_id}" if doc_id else None,
                None,
                doc_id,
                json.dumps(meta, ensure_ascii=False),
            ))

        if rows:
            _insert_batch(cur, rows)
            total += len(rows)
            conn.commit()
            print(f"  {json_file.name}: {len(rows)} imported", flush=True)

    conn.close()
    print(f"  CC API done: {total:,} records", flush=True)
    return total


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    docx_dir = DATA_DIR / "eakta-docx"

    if mode in ("all", "eakta"):
        jsonl_files = sorted((DATA_DIR / "eakta").glob("*.jsonl"))
        print(f"=== Importing eakta: {len(jsonl_files)} files ===", flush=True)

        chunk_size = max(1, len(jsonl_files) // 20)
        chunks = [jsonl_files[i:i + chunk_size] for i in range(0, len(jsonl_files), chunk_size)]

        total = 0
        skipped = 0
        with ProcessPoolExecutor(max_workers=20) as pool:
            futures = {pool.submit(import_eakta_batch, chunk, docx_dir): i for i, chunk in enumerate(chunks)}
            for fut in as_completed(futures):
                t, s = fut.result()
                total += t
                skipped += s
                print(f"  Chunk done: +{t:,} imported, {s} skipped", flush=True)

        print(f"\neakta total: {total:,} imported, {skipped} skipped", flush=True)

    if mode in ("all", "huncourt"):
        csv_path = DATA_DIR / "huncourt-osf" / "huncourt.csv"
        if csv_path.exists():
            import_huncourt_csv(csv_path)
        else:
            print(f"HUNCOURT CSV not found: {csv_path}", flush=True)

    if mode in ("all", "cc"):
        cc_dir = DATA_DIR / "constitutional"
        if cc_dir.exists():
            import_cc_api(cc_dir)
        else:
            print(f"CC dir not found: {cc_dir}", flush=True)

    print("\n=== Import complete ===", flush=True)


if __name__ == "__main__":
    main()
