#!/usr/bin/env python3
"""Fetch full texts for Czech justice.cz decisions from finaldoc API."""

import json
import os
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2

DB_URL = os.environ.get("DATABASE_URL", "postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_prod")
MAX_WORKERS = 20
BATCH_SIZE = 200


def extract_text(doc: dict) -> str:
    parts = []
    for section in ("header", "verdict", "justification", "information"):
        paragraphs = doc.get(section, [])
        if not paragraphs:
            continue
        for para in paragraphs:
            texts = para.get("texts", [])
            line = "".join(t.get("text", "") for t in texts)
            if line.strip():
                parts.append(line.strip())

    verdict_text = doc.get("verdictText", "")
    justification_text = doc.get("justificationText", "")

    structured = "\n\n".join(parts)
    plain = f"{verdict_text}\n\n{justification_text}".strip()

    result = structured if len(structured) > len(plain) else plain
    return result.replace("\x00", "")


def fetch_one(row: tuple, session: requests.Session) -> tuple:
    record_id, url = row
    for attempt in range(3):
        try:
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            doc = resp.json()
            text = extract_text(doc)
            return (record_id, text, None)
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                return (record_id, None, str(e))


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT count(*) FROM cz_court_decisions
        WHERE source = 'justice.cz' AND full_text IS NULL AND source_url IS NOT NULL
    """)
    total = cur.fetchone()[0]
    print(f"Records to fetch: {total}")

    processed = 0
    updated = 0
    failed = 0
    t0 = time.time()

    while True:
        cur.execute("""
            SELECT id, source_url FROM cz_court_decisions
            WHERE source = 'justice.cz' AND full_text IS NULL AND source_url IS NOT NULL
            LIMIT %s
        """, (BATCH_SIZE * MAX_WORKERS,))
        rows = cur.fetchall()
        if not rows:
            break

        session = requests.Session()
        session.headers["Accept"] = "application/json"

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(fetch_one, row, session): row[0] for row in rows}

            batch_updates = []
            for future in as_completed(futures):
                record_id, text, error = future.result()
                processed += 1
                if text:
                    batch_updates.append((text, record_id))
                else:
                    failed += 1

            if batch_updates:
                cur2 = conn.cursor()
                for text, rid in batch_updates:
                    cur2.execute(
                        "UPDATE cz_court_decisions SET full_text = %s, updated_at = NOW() WHERE id = %s",
                        (text, rid)
                    )
                    updated += 1
                conn.commit()
                cur2.close()

        elapsed = time.time() - t0
        rate = processed / elapsed if elapsed > 0 else 0
        pct = processed / total * 100 if total > 0 else 0
        print(f"  {processed}/{total} ({pct:.1f}%) | updated: {updated} | failed: {failed} | {rate:.0f}/s")

    conn.close()
    print(f"\nDone: {updated} updated, {failed} failed in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
