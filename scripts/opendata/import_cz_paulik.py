#!/usr/bin/env python3
"""Import Paulik Czech Constitutional Court dataset from Zenodo ZIP into DB."""

import csv
import io
import json
import os
import sys
import time
import zipfile

csv.field_size_limit(sys.maxsize)

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("DATABASE_URL")
ZIP_PATH = "/home/ubuntu/opendata/czech/zenodo-paulik/ccc_database.zip"
BATCH_SIZE = 500


def main():
    zf = zipfile.ZipFile(ZIP_PATH)

    print("Loading texts...")
    texts = {}
    with zf.open("ccc_database/csv/ccc_texts.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"))
        for row in reader:
            texts[row["doc_id"]] = row.get("text", "").replace("\x00", "")
    print(f"  Loaded {len(texts)} texts")

    print("Loading metadata...")
    with zf.open("ccc_database/csv/ccc_metadata.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"))
        meta_rows = list(reader)
    print(f"  Loaded {len(meta_rows)} metadata rows")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("SELECT count(*) FROM cz_court_decisions WHERE source = 'paulik-zenodo'")
    existing = cur.fetchone()[0]
    print(f"  Already imported: {existing}")

    if existing >= len(meta_rows):
        print("  All already imported, skipping")
        return

    batch = []
    imported = 0
    skipped = 0
    t0 = time.time()

    for row in meta_rows:
        doc_id = row["doc_id"]
        ecli = doc_id if doc_id.startswith("ECLI:") else None
        record_id = f"paulik-{doc_id}"
        text = texts.get(doc_id, "")

        na = lambda v: None if v == "NA" or not v else v

        batch.append((
            record_id,
            ecli,
            "paulik-zenodo",
            "Constitutional Court",
            "ConCo",
            None,
            na(row.get("case_id")),
            na(row.get("type_decision")),
            na(row.get("date_decision")),
            na(row.get("date_publication")),
            na(row.get("judge_rapporteur_name")),
            na(row.get("subject_proceedings")),
            None,
            None,
            na(row.get("applicant")),
            None,
            text if text else None,
            na(row.get("url_address")),
            json.dumps({
                k: v for k, v in row.items()
                if k not in ("doc_id", "case_id", "date_decision", "date_publication",
                             "judge_rapporteur_name", "subject_proceedings", "applicant",
                             "url_address", "type_decision")
                and v and v != "NA"
            }) or None,
        ))

        if len(batch) >= BATCH_SIZE:
            execute_values(cur, """
                INSERT INTO cz_court_decisions
                    (id, ecli, source, court_name, court_type, chamber,
                     case_number, decision_type, decision_date, publication_date,
                     judge, subject, keywords, cited_provisions,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, batch, page_size=BATCH_SIZE)
            conn.commit()
            imported += len(batch)
            batch = []
            elapsed = time.time() - t0
            print(f"  {imported}/{len(meta_rows)} ({100*imported/len(meta_rows):.1f}%) | {imported/elapsed:.0f}/s")

    if batch:
        execute_values(cur, """
            INSERT INTO cz_court_decisions
                (id, ecli, source, court_name, court_type, chamber,
                 case_number, decision_type, decision_date, publication_date,
                 judge, subject, keywords, cited_provisions,
                 parties, abstract, full_text, source_url, metadata_json)
            VALUES %s
            ON CONFLICT (id) DO NOTHING
        """, batch, page_size=BATCH_SIZE)
        conn.commit()
        imported += len(batch)

    conn.close()
    print(f"\nDone: {imported} imported in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
