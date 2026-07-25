#!/usr/bin/env python3
"""Fetch full texts for CH (HTML from entscheidsuche.ch), LU (PDFs), EE (ECLI sitemaps → riigiteataja)."""

import os
import sys
import re
import json
import time
import subprocess
import tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
import requests

DB_URL = os.environ["DATABASE_URL"]
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}
BATCH_SIZE = 500


def clean(text):
    if not text:
        return None
    text = text.replace("\x00", "")
    return text if len(text) > 50 else None


# ============================================================
# SWITZERLAND - fetch HTML from entscheidsuche.ch
# ============================================================

def fetch_ch_html(row):
    ecli, json_url = row
    if not json_url:
        return ecli, None

    html_url = json_url.replace(".json", ".html")
    try:
        r = requests.get(html_url, timeout=30, headers=HEADERS)
        if r.status_code == 200 and len(r.text) > 200:
            text = re.sub(r"<[^>]+>", " ", r.text)
            text = re.sub(r"\s+", " ", text).strip()
            return ecli, clean(text)
    except Exception:
        pass
    return ecli, None


def run_ch(workers=20):
    print("=== Switzerland: fetching HTML full texts ===", flush=True)

    BATCH = 5000
    success = 0
    fail = 0
    offset = 0

    while True:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("SELECT ecli, json_url FROM ch_court_decisions WHERE (full_text IS NULL OR full_text = '') AND json_url IS NOT NULL AND json_url LIKE '%%/CH_BGer/%%' ORDER BY ecli LIMIT %s", (BATCH,))
        batch_rows = cur.fetchall()
        conn.close()

        if not batch_rows:
            break

        updates = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(fetch_ch_html, row): row for row in batch_rows}
            for fut in as_completed(futures):
                ecli, text = fut.result()
                if text:
                    updates.append((text, ecli))
                    success += 1
                else:
                    fail += 1

        if updates:
            conn2 = psycopg2.connect(DB_URL)
            c2 = conn2.cursor()
            c2.executemany("UPDATE ch_court_decisions SET full_text = %s, updated_at = now() WHERE ecli = %s", updates)
            conn2.commit()
            conn2.close()

        offset += len(batch_rows)
        print(f"  CH: {offset:,} processed ({success:,} ok, {fail:,} fail)", flush=True)

    print(f"  CH done: {success:,} texts fetched, {fail:,} failed", flush=True)


# ============================================================
# LUXEMBOURG - download PDFs and extract text
# ============================================================

def fetch_lu_pdf(row):
    row_id, file_url = row
    if not file_url:
        return row_id, None

    try:
        r = requests.get(file_url, timeout=60, headers=HEADERS)
        if r.status_code == 200 and len(r.content) > 500 and b"%PDF" in r.content[:10]:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(r.content)
                tmp_path = tmp.name

            result = subprocess.run(
                ["pdftotext", "-enc", "UTF-8", tmp_path, "-"],
                capture_output=True, timeout=30
            )
            os.unlink(tmp_path)

            text = result.stdout.decode("utf-8", errors="replace").replace("\x00", "")
            return row_id, clean(text)
    except Exception:
        pass
    return row_id, None


def run_lu(workers=20):
    print("\n=== Luxembourg: downloading PDFs + text extraction ===", flush=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("SELECT id, file_url FROM lu_court_decisions WHERE (full_text IS NULL OR full_text = '') AND file_url IS NOT NULL")
    rows = cur.fetchall()
    print(f"  {len(rows):,} decisions to fetch", flush=True)

    if not rows:
        conn.close()
        return

    success = 0
    fail = 0
    updates = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_lu_pdf, row): row for row in rows}
        for i, fut in enumerate(as_completed(futures)):
            row_id, text = fut.result()
            if text:
                updates.append((text, row_id))
                success += 1
            else:
                fail += 1

            if len(updates) >= BATCH_SIZE:
                cur.executemany("UPDATE lu_court_decisions SET full_text = %s WHERE id = %s", updates)
                conn.commit()
                updates = []

            if (i + 1) % 1000 == 0:
                print(f"  LU: {i+1}/{len(rows)} ({success} ok, {fail} fail)", flush=True)

    if updates:
        cur.executemany("UPDATE lu_court_decisions SET full_text = %s WHERE id = %s", updates)
        conn.commit()

    conn.close()
    print(f"  LU done: {success:,} texts fetched, {fail:,} failed", flush=True)


# ============================================================
# MAIN
# ============================================================

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "ch"):
        run_ch(workers=20)

    if mode in ("all", "lu"):
        run_lu(workers=20)

    print("\n=== Full text fetch done ===", flush=True)


if __name__ == "__main__":
    main()
