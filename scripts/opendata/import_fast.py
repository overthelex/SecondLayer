#!/usr/bin/env python3
"""Fast import FR, DE, LT, EE using COPY + temp tables."""

import os
import sys
import csv
import json
import gzip
import hashlib
import re
import io
import xml.etree.ElementTree as ET
from pathlib import Path

import psycopg2

DB_URL = os.environ["DATABASE_URL"]


def clean(v):
    if isinstance(v, str):
        return v.replace("\\", "\\\\").replace("\x00", "").replace("\t", " ").replace("\n", " ").replace("\r", "")
    return v


def clean_text(v):
    """For COPY: escape backslash, replace tabs, encode newlines as \\n literals."""
    if isinstance(v, str):
        return v.replace("\\", "\\\\").replace("\x00", "").replace("\t", " ").replace("\n", "\\n").replace("\r", "")
    return v


def pg_array(lst):
    """Format as PG array literal safe for COPY. Avoid nested quote hell by using simple escaping."""
    if not lst:
        return None
    escaped = []
    for item in lst:
        s = str(item).strip()
        s = s.replace('"', "'").replace("\\", "").replace("\t", " ").replace("\n", " ")
        escaped.append(f'"{s}"')
    return "{" + ",".join(escaped) + "}"


def import_france():
    import pyarrow.parquet as pq

    print("=== France (COPY) ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("TRUNCATE fr_court_decisions")
    conn.commit()

    parquet_dir = Path("/home/ubuntu/opendata/western-europe/france/hf-jurisprudence")
    files = sorted(parquet_dir.rglob("*.parquet"))
    total = 0

    CHUNK = 10000
    fr_cols = ["id", "ecli", "source", "jurisdiction", "court_name",
               "chamber", "case_number", "decision_type", "decision_date",
               "solution", "themes", "summary", "full_text", "zones",
               "source_url", "metadata_json"]

    needed_cols = ["id", "ecli", "number", "jurisdiction", "formation", "chamber",
                   "type", "decision_date", "solution", "themes", "summary", "text"]

    for fi, f in enumerate(files):
        schema = pq.read_schema(f)
        read_cols = [c for c in needed_cols if c in schema.names]
        table = pq.read_table(f, columns=read_cols)
        cols = table.column_names
        n = len(table)

        buf = io.StringIO()
        chunk_count = 0
        for i in range(n):
            def g(col):
                if col in cols:
                    v = table.column(col)[i].as_py()
                    return v if v else None
                return None

            hf_id = g("id") or ""
            rec_id = f"fr-{hf_id}" if hf_id else f"fr-{fi}-{i}"
            ecli = clean(g("ecli"))
            number = clean(g("number"))

            themes = g("themes")
            if isinstance(themes, str):
                themes = [t.strip() for t in themes.split(",") if t.strip()]
            elif isinstance(themes, list):
                themes = [str(t) for t in themes if t]

            fields = [
                rec_id,
                ecli or number or "",
                "hf-jurisprudence",
                clean(g("jurisdiction")) or "",
                clean(g("formation")) or "",
                clean(g("chamber")) or "",
                clean(number) or "",
                clean(g("type")) or "",
                clean(g("decision_date")) or "",
                clean(g("solution")) or "",
                pg_array(themes) or "",
                clean(g("summary")) or "",
                clean_text(g("text")) or "",
                "",  # zones
                "",  # source_url
                "",  # metadata_json
            ]
            buf.write("\t".join(fld if fld else "\\N" for fld in fields) + "\n")
            chunk_count += 1

            if chunk_count >= CHUNK:
                buf.seek(0)
                cur.execute("CREATE TEMP TABLE _fr_tmp (LIKE fr_court_decisions ) ON COMMIT DROP")
                cur.copy_from(buf, "_fr_tmp", sep="\t", null="\\N", columns=fr_cols)
                cur.execute(f"INSERT INTO fr_court_decisions ({','.join(fr_cols)}) SELECT {','.join(fr_cols)} FROM _fr_tmp ON CONFLICT (id) DO NOTHING")
                inserted = cur.rowcount
                conn.commit()
                total += inserted
                buf = io.StringIO()
                chunk_count = 0
                print(f"  FR {total:,} / {n} ({f.name})", flush=True)

        if chunk_count > 0:
            buf.seek(0)
            cur.execute("CREATE TEMP TABLE _fr_tmp (LIKE fr_court_decisions ) ON COMMIT DROP")
            cur.copy_from(buf, "_fr_tmp", sep="\t", null="\\N", columns=fr_cols)
            cur.execute(f"INSERT INTO fr_court_decisions ({','.join(fr_cols)}) SELECT {','.join(fr_cols)} FROM _fr_tmp ON CONFLICT (id) DO NOTHING")
            total += cur.rowcount
            conn.commit()

        print(f"  [{fi+1}/{len(files)}] {total:,} imported ({f.name})", flush=True)

    conn.close()
    print(f"  France done: {total:,}", flush=True)


def import_germany():
    print("\n=== Germany (COPY) ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("TRUNCATE de_court_decisions")
    conn.commit()

    jsonl_path = Path("/home/ubuntu/opendata/western-europe/germany/hf-harshildarji/data/cases.jsonl.gz")
    total = 0
    buf = io.StringIO()
    flush_every = 10000

    with gzip.open(jsonl_path, "rt", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            rec_id = f"de-{d.get('id', '')}"

            parts = []
            for k in ["tenor", "tatbestand", "entscheidungsgründe", "rechtsmittelbelehrung"]:
                v = d.get(k, "")
                if isinstance(v, str) and v:
                    parts.append(v)
                elif isinstance(v, list):
                    parts.append(" ".join(str(x) for x in v))
            full_text = clean_text("\n\n".join(parts)) if parts else ""

            court = d.get("court", {})
            court_name = court.get("name", "") if isinstance(court, dict) else str(court)

            tenor = d.get("tenor", "")
            if isinstance(tenor, list):
                tenor = " ".join(str(x) for x in tenor)
            tatbestand = d.get("tatbestand", "")
            if isinstance(tatbestand, list):
                tatbestand = " ".join(str(x) for x in tatbestand)
            reasoning = d.get("entscheidungsgründe", "")
            if isinstance(reasoning, list):
                reasoning = " ".join(str(x) for x in reasoning)

            fields = [
                rec_id,
                clean(d.get("ecli")) or "",
                "openlegaldata",
                clean(court_name),
                clean(court.get("jurisdiction", "")) if isinstance(court, dict) else "",
                clean(court.get("level_of_appeal", "")) if isinstance(court, dict) else "",
                clean(d.get("file_number")) or "",
                clean(d.get("type")) or "",
                clean(d.get("date")) or "",
                "",  # subject_area
                full_text,
                clean_text(tenor) if isinstance(tenor, str) else "",
                clean_text(tatbestand) if isinstance(tatbestand, str) else "",
                clean_text(reasoning) if isinstance(reasoning, str) else "",
                "",  # source_url
                "",  # metadata_json
            ]
            buf.write("\t".join(f if f else "\\N" for f in fields) + "\n")
            total += 1

            de_cols = ["id", "ecli", "source", "court_name", "court_type",
                       "court_level", "case_number", "decision_type",
                       "decision_date", "subject_area", "full_text",
                       "tenor", "tatbestand", "reasoning", "source_url",
                       "metadata_json"]
            if total % flush_every == 0:
                buf.seek(0)
                cur.execute("CREATE TEMP TABLE _de_tmp (LIKE de_court_decisions ) ON COMMIT DROP")
                cur.copy_from(buf, "_de_tmp", sep="\t", null="\\N", columns=de_cols)
                cur.execute(f"INSERT INTO de_court_decisions ({','.join(de_cols)}) SELECT {','.join(de_cols)} FROM _de_tmp ON CONFLICT (id) DO NOTHING")
                conn.commit()
                buf = io.StringIO()
                print(f"  {total:,} imported", flush=True)

    de_cols = ["id", "ecli", "source", "court_name", "court_type",
               "court_level", "case_number", "decision_type",
               "decision_date", "subject_area", "full_text",
               "tenor", "tatbestand", "reasoning", "source_url",
               "metadata_json"]
    if buf.tell() > 0:
        buf.seek(0)
        cur.execute("CREATE TEMP TABLE _de_tmp (LIKE de_court_decisions ) ON COMMIT DROP")
        cur.copy_from(buf, "_de_tmp", sep="\t", null="\\N", columns=de_cols)
        cur.execute(f"INSERT INTO de_court_decisions ({','.join(de_cols)}) SELECT {','.join(de_cols)} FROM _de_tmp ON CONFLICT (id) DO NOTHING")
        conn.commit()

    conn.close()
    print(f"  Germany done: {total:,}", flush=True)


def import_lithuania():
    print("\n=== Lithuania (COPY) ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    text_dir = Path("/home/ubuntu/opendata/baltics/lithuania/texts")
    csv_dir = Path("/home/ubuntu/opendata/baltics/lithuania/csv")

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

    buf = io.StringIO()
    total = 0
    for cf in sorted(csv_dir.glob("*.csv")):
        with open(cf, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                doc_id = row.get("Dokumento_ID", "").strip()
                if not doc_id:
                    continue

                categories = row.get("Kategorijos", "")
                cat_list = [c.strip() for c in categories.split(";") if c.strip()] if categories else None
                eu_norms = row.get("Naudotos_ES_Teises_Normos", "")
                eu_list = [n.strip() for n in eu_norms.split(";") if n.strip()] if eu_norms else None
                dur = row.get("Nagrinejimo_Trukme", "")
                duration = dur if dur and dur.isdigit() else ""
                full_text = clean_text(texts.get(doc_id)) or ""

                fields = [
                    f"lt-{doc_id}",
                    doc_id,
                    "liteko",
                    clean(row.get("Teismas")) or "",
                    clean(row.get("Bylos_Numeris")) or "",
                    clean(row.get("Instancija")) or "",
                    clean(row.get("Tipas")) or "",
                    clean(row.get("Rezultatas")) or "",
                    clean(row.get("Baigta")) or "",
                    clean(row.get("Gauta")) or "",
                    clean(row.get("Teisejas")) or "",
                    clean(row.get("Kolegija")) or "",
                    clean(row.get("Šalys")) or "",
                    pg_array(cat_list) or "",
                    pg_array(eu_list) or "",
                    duration,
                    full_text,
                    clean(row.get("Nuoroda")) or "",
                    "",  # metadata_json
                ]
                buf.write("\t".join(f if f else "\\N" for f in fields) + "\n")
                total += 1

    lt_cols = ["id", "dokumento_id", "source", "court_name", "case_number",
                "instance", "case_type", "result", "decision_date", "received_date",
                "judge", "panel", "parties", "categories", "eu_norms",
                "duration_days", "full_text", "source_url", "metadata_json"]
    buf.seek(0)
    cur.execute("CREATE TEMP TABLE _lt_tmp (LIKE lt_court_decisions) ON COMMIT DROP")
    cur.copy_from(buf, "_lt_tmp", sep="\t", null="\\N", columns=lt_cols)
    cur.execute(f"INSERT INTO lt_court_decisions ({','.join(lt_cols)}) SELECT {','.join(lt_cols)} FROM _lt_tmp ON CONFLICT (id) DO NOTHING")
    total = cur.rowcount
    conn.commit()
    conn.close()
    print(f"  Lithuania done: {total:,}", flush=True)


def import_estonia():
    print("\n=== Estonia metadata (COPY) ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    xml_dir = Path("/home/ubuntu/opendata/baltics/estonia/xml")
    type_map = {
        "tsiviilasi.xml": "civil",
        "kriminaalasi.xml": "criminal",
        "haldusasi.xml": "administrative",
        "vaarteoasi.xml": "misdemeanor",
        "pohiseaduslikkuse_jarelevalve_asi.xml": "constitutional",
    }
    total = 0

    for xml_file, case_type in type_map.items():
        fpath = xml_dir / xml_file
        if not fpath.exists():
            continue

        tree = ET.parse(fpath)
        root = tree.getroot()
        buf = io.StringIO()

        for item in root:
            meta = {}
            for child in item:
                meta[child.tag] = child.text or ""

            case_num = meta.get("MenetluseNr", "")
            doc_num = meta.get("DokumendiNr", "")
            rec_id = f"ee-{doc_num or case_num or hashlib.md5(json.dumps(meta).encode()).hexdigest()}"

            fields = [
                rec_id,
                clean(meta.get("ECLINumber")) or "",
                "avaandmed.rik.ee",
                clean(meta.get("Kohus") or meta.get("KohtumajaNimetus")) or "",
                clean(case_num),
                case_type,
                clean(meta.get("DokumendiLiik")) or "",
                clean(meta.get("DokumendiKuupaev", ""))[:10] or "",
                clean(meta.get("KohtunikuNimi")) or "",
                clean(meta.get("MenetluseTulemus")) or "",
                "",  # full_text
                "",  # source_url
                "",  # pdf_url
                json.dumps(meta, ensure_ascii=False).replace("\t", " ").replace("\n", " "),
            ]
            buf.write("\t".join(f if f else "\\N" for f in fields) + "\n")
            total += 1

        ee_cols = ["id", "ecli", "source", "court_name", "case_number",
                   "case_type", "decision_type", "decision_date", "judge",
                   "outcome", "full_text", "source_url", "pdf_url", "metadata_json"]
        buf.seek(0)
        cur.execute("CREATE TEMP TABLE _ee_tmp (LIKE ee_court_decisions) ON COMMIT DROP")
        cur.copy_from(buf, "_ee_tmp", sep="\t", null="\\N", columns=ee_cols)
        cur.execute(f"INSERT INTO ee_court_decisions ({','.join(ee_cols)}) SELECT {','.join(ee_cols)} FROM _ee_tmp ON CONFLICT (id) DO NOTHING")
        conn.commit()
        print(f"  {xml_file}: {total:,} total", flush=True)

    conn.close()
    print(f"  Estonia done: {total:,}", flush=True)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("all", "fr"): import_france()
    if mode in ("all", "de"): import_germany()
    if mode in ("all", "lt"): import_lithuania()
    if mode in ("all", "ee"): import_estonia()
    print("\n=== All fast imports done ===", flush=True)


if __name__ == "__main__":
    main()
