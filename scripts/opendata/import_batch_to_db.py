#!/usr/bin/env python3
"""Import FR, DE, LT, BE court decisions into PostgreSQL."""

import os
import sys
import csv
import json
import re
import time
import hashlib
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("DATABASE_URL")
BATCH_SIZE = 500


def clean(v):
    """Strip NUL bytes from strings."""
    if isinstance(v, str):
        return v.replace("\x00", "")
    return v


def import_france(data_dir):
    """Import French decisions from HF jurisprudence parquet."""
    import pyarrow.parquet as pq

    print("=== Importing France ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0

    parquet_dir = Path(data_dir) / "france" / "hf-jurisprudence"
    files = sorted(parquet_dir.rglob("*.parquet"))
    print(f"  {len(files)} parquet files", flush=True)

    for fi, f in enumerate(files):
        table = pq.read_table(f)
        cols = table.column_names

        for batch_start in range(0, len(table), BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, len(table))
            rows = []

            for i in range(batch_start, batch_end):
                def g(col):
                    if col in cols:
                        v = table.column(col)[i].as_py()
                        return v if v else None
                    return None

                hf_id = g("id") or ""
                ecli = g("ecli")
                number = g("number")
                rec_id = f"fr-{hf_id}" if hf_id else f"fr-{fi}-{i}"

                themes = g("themes")
                if isinstance(themes, str):
                    themes = [t.strip() for t in themes.split(",") if t.strip()]

                rows.append((
                    rec_id,
                    clean(ecli) or clean(number) or None,
                    "hf-jurisprudence",
                    clean(g("jurisdiction") or g("juridiction")),
                    clean(g("formation") or g("chambre_nom")),
                    clean(g("chamber") or g("chambre")),
                    clean(number) or clean(g("numero")),
                    clean(g("type") or g("decision_type")),
                    clean(g("decision_date") or g("date_decision")),
                    clean(g("solution")),
                    themes if isinstance(themes, list) else None,
                    clean(g("sommaire") or g("summary")),
                    clean(g("texte_integral") or g("text") or g("full_text")),
                    json.dumps({k: table.column(k)[i].as_py() for k in ["zones", "visa", "rapprochements"] if k in cols}, ensure_ascii=False) if any(k in cols for k in ["zones", "visa"]) else None,
                    g("url") or g("source_url"),
                    None,
                ))

            if rows:
                sql = """INSERT INTO fr_court_decisions (
                    id, ecli, source, jurisdiction, court_name, chamber,
                    case_number, decision_type, decision_date, solution,
                    themes, summary, full_text, zones, source_url, metadata_json
                ) VALUES %s ON CONFLICT (id) DO NOTHING"""
                execute_values(cur, sql, rows, page_size=BATCH_SIZE)
                total += cur.rowcount

            if (batch_start // BATCH_SIZE) % 100 == 0 and batch_start > 0:
                conn.commit()

        conn.commit()
        print(f"  [{fi+1}/{len(files)}] {total:,} imported", flush=True)

    conn.close()
    print(f"  France done: {total:,}", flush=True)


def import_germany(data_dir):
    """Import German decisions from harshildarji/openlegaldata JSONL."""
    import gzip

    print("\n=== Importing Germany ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0

    jsonl_path = Path(data_dir) / "germany" / "hf-harshildarji" / "data" / "cases.jsonl.gz"
    if not jsonl_path.exists():
        print(f"  File not found: {jsonl_path}", flush=True)
        return

    rows = []
    with gzip.open(jsonl_path, "rt", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            rec_id = f"de-old-{d.get('id', '')}"
            ecli = d.get("ecli")

            parts = []
            for k in ["tenor", "tatbestand", "entscheidungsgründe", "rechtsmittelbelehrung"]:
                v = d.get(k, "")
                if isinstance(v, str) and v:
                    parts.append(v)
                elif isinstance(v, list):
                    parts.append(" ".join(str(x) for x in v))
            full_text = clean("\n\n".join(parts)) if parts else None

            court = d.get("court", {})
            court_name = court.get("name", "") if isinstance(court, dict) else str(court)

            tenor_val = d.get("tenor", "")
            if isinstance(tenor_val, list):
                tenor_val = " ".join(str(x) for x in tenor_val)

            rows.append((
                rec_id,
                ecli,
                "openlegaldata",
                court_name,
                court.get("jurisdiction", "") if isinstance(court, dict) else None,
                court.get("level_of_appeal", "") if isinstance(court, dict) else None,
                d.get("file_number"),
                d.get("type"),
                d.get("date"),
                None,
                full_text,
                tenor_val if isinstance(tenor_val, str) else None,
                d.get("tatbestand") if isinstance(d.get("tatbestand"), str) else None,
                d.get("entscheidungsgründe") if isinstance(d.get("entscheidungsgründe"), str) else None,
                None,
                json.dumps({"references": d.get("references")}, ensure_ascii=False) if d.get("references") else None,
            ))

            if len(rows) >= BATCH_SIZE:
                sql = """INSERT INTO de_court_decisions (
                    id, ecli, source, court_name, court_type, court_level,
                    case_number, decision_type, decision_date, subject_area,
                    full_text, tenor, tatbestand, reasoning, source_url, metadata_json
                ) VALUES %s ON CONFLICT (id) DO NOTHING"""
                execute_values(cur, sql, rows, page_size=BATCH_SIZE)
                total += cur.rowcount
                rows = []
                if total % 10000 == 0:
                    conn.commit()
                    print(f"  {total:,} imported", flush=True)

    if rows:
        sql = """INSERT INTO de_court_decisions (
            id, ecli, source, court_name, court_type, court_level,
            case_number, decision_type, decision_date, subject_area,
            full_text, tenor, tatbestand, reasoning, source_url, metadata_json
        ) VALUES %s ON CONFLICT (id) DO NOTHING"""
        execute_values(cur, sql, rows, page_size=BATCH_SIZE)
        total += cur.rowcount

    conn.commit()
    conn.close()
    print(f"  Germany done: {total:,}", flush=True)


def import_lithuania(data_dir):
    """Import Lithuanian decisions from LITEKO CSV + full texts."""
    print("\n=== Importing Lithuania ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0

    csv_dir = Path(data_dir) / "lithuania" / "csv"
    text_dir = Path(data_dir) / "lithuania" / "texts"

    # Load texts into dict
    texts = {}
    for tf in sorted(text_dir.glob("*.jsonl")):
        with open(tf, encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    texts[d["doc_id"]] = d["text"]
                except:
                    pass
    print(f"  Loaded {len(texts):,} texts", flush=True)

    rows = []
    for cf in sorted(csv_dir.glob("*.csv")):
        with open(cf, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                doc_id = row.get("Dokumento_ID", "").strip()
                if not doc_id:
                    continue

                rec_id = f"lt-{doc_id}"
                categories = row.get("Kategorijos", "")
                cat_list = [c.strip() for c in categories.split(";") if c.strip()] if categories else None
                eu_norms = row.get("Naudotos_ES_Teises_Normos", "")
                eu_list = [n.strip() for n in eu_norms.split(";") if n.strip()] if eu_norms else None

                dur = row.get("Nagrinejimo_Trukme", "")
                duration = int(dur) if dur and dur.isdigit() else None

                full_text = clean(texts.get(doc_id))

                rows.append((
                    rec_id,
                    doc_id,
                    "liteko",
                    row.get("Teismas"),
                    row.get("Bylos_Numeris"),
                    row.get("Instancija"),
                    row.get("Tipas"),
                    row.get("Rezultatas"),
                    row.get("Baigta") or None,
                    row.get("Gauta") or None,
                    row.get("Teisejas"),
                    row.get("Kolegija"),
                    row.get("Šalys"),
                    cat_list,
                    eu_list,
                    duration,
                    full_text,
                    row.get("Nuoroda"),
                    json.dumps(row, ensure_ascii=False),
                ))

                if len(rows) >= BATCH_SIZE:
                    sql = """INSERT INTO lt_court_decisions (
                        id, dokumento_id, source, court_name, case_number,
                        instance, case_type, result, decision_date, received_date,
                        judge, panel, parties, categories, eu_norms,
                        duration_days, full_text, source_url, metadata_json
                    ) VALUES %s ON CONFLICT (id) DO NOTHING"""
                    execute_values(cur, sql, rows, page_size=BATCH_SIZE)
                    total += cur.rowcount
                    rows = []
                    if total % 10000 == 0:
                        conn.commit()
                        print(f"  {total:,} imported", flush=True)

    if rows:
        sql = """INSERT INTO lt_court_decisions (
            id, dokumento_id, source, court_name, case_number,
            instance, case_type, result, decision_date, received_date,
            judge, panel, parties, categories, eu_norms,
            duration_days, full_text, source_url, metadata_json
        ) VALUES %s ON CONFLICT (id) DO NOTHING"""
        execute_values(cur, sql, rows, page_size=BATCH_SIZE)
        total += cur.rowcount

    conn.commit()
    conn.close()
    print(f"  Lithuania done: {total:,}", flush=True)


def import_estonia_metadata(data_dir):
    """Import Estonian metadata from XML files."""
    import xml.etree.ElementTree as ET

    print("\n=== Importing Estonia (metadata) ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    total = 0

    xml_dir = Path(data_dir) / "estonia" / "xml"
    type_map = {
        "tsiviilasi.xml": "civil",
        "kriminaalasi.xml": "criminal",
        "haldusasi.xml": "administrative",
        "vaarteoasi.xml": "misdemeanor",
        "pohiseaduslikkuse_jarelevalve_asi.xml": "constitutional",
    }

    for xml_file, case_type in type_map.items():
        fpath = xml_dir / xml_file
        if not fpath.exists():
            continue

        tree = ET.parse(fpath)
        root = tree.getroot()
        rows = []

        for item in root:
            case_num = ""
            doc_num = ""
            meta = {}
            for child in item:
                meta[child.tag] = child.text or ""
                if child.tag == "MenetluseNr":
                    case_num = child.text or ""
                elif child.tag == "DokumendiNr":
                    doc_num = child.text or ""

            rec_id = f"ee-{doc_num or case_num or hashlib.md5(json.dumps(meta).encode()).hexdigest()}"

            rows.append((
                rec_id,
                meta.get("ECLINumber") or None,
                "avaandmed.rik.ee",
                meta.get("Kohus") or meta.get("KohtumajaNimetus"),
                case_num,
                case_type,
                meta.get("DokumendiLiik"),
                meta.get("DokumendiKuupaev", "")[:10] or None,
                meta.get("KohtunikuNimi"),
                meta.get("MenetluseTulemus"),
                None,  # no full text
                None,
                None,
                json.dumps(meta, ensure_ascii=False),
            ))

            if len(rows) >= BATCH_SIZE:
                sql = """INSERT INTO ee_court_decisions (
                    id, ecli, source, court_name, case_number, case_type,
                    decision_type, decision_date, judge, outcome,
                    full_text, source_url, pdf_url, metadata_json
                ) VALUES %s ON CONFLICT (id) DO NOTHING"""
                execute_values(cur, sql, rows, page_size=BATCH_SIZE)
                total += cur.rowcount
                rows = []

        if rows:
            sql = """INSERT INTO ee_court_decisions (
                id, ecli, source, court_name, case_number, case_type,
                decision_type, decision_date, judge, outcome,
                full_text, source_url, pdf_url, metadata_json
            ) VALUES %s ON CONFLICT (id) DO NOTHING"""
            execute_values(cur, sql, rows, page_size=BATCH_SIZE)
            total += cur.rowcount

        conn.commit()
        print(f"  {xml_file} ({case_type}): {total:,} total", flush=True)

    conn.close()
    print(f"  Estonia done: {total:,}", flush=True)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    we_dir = "/home/ubuntu/opendata/western-europe"
    baltic_dir = "/home/ubuntu/opendata/baltics"

    if mode in ("all", "fr"):
        import_france(we_dir)

    if mode in ("all", "de"):
        import_germany(we_dir)

    if mode in ("all", "lt"):
        import_lithuania(baltic_dir)

    if mode in ("all", "ee"):
        import_estonia_metadata(baltic_dir)

    print("\n=== All imports done ===", flush=True)


if __name__ == "__main__":
    main()
