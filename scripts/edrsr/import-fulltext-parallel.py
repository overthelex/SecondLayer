#!/usr/bin/env python3
"""
Parallel RTF→text conversion + PG import for edrsr_fulltext.
Uses multiprocessing for CPU-bound RTF parsing, batched COPY for DB.

Usage: python3 import-fulltext-parallel.py [--workers 12] [--batch 2000]
"""
import csv
import io
import os
import re
import subprocess
import sys
import time
import argparse
from multiprocessing import Pool, cpu_count
from pathlib import Path

csv.field_size_limit(sys.maxsize)

RTF_DIR = Path("/tmp/edrsr-rtf-2025-2026")
CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"


# ── RTF → plaintext ──

def decode_win1251_byte(match):
    byte_val = int(match.group(1), 16)
    if byte_val > 127:
        try:
            return bytes([byte_val]).decode('windows-1251')
        except Exception:
            return chr(byte_val)
    return chr(byte_val)


def decode_unicode(match):
    code = int(match.group(1))
    if code < 0:              # RTF \uN is a signed 16-bit value
        code += 65536
    return chr(code) if 0 <= code <= 0x10FFFF else ''


def remove_nested_group(text, keyword):
    idx = text.find('{\\' + keyword)
    while idx != -1:
        depth = 0
        end = idx
        for i in range(idx, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        text = text[:idx] + text[end:]
        idx = text.find('{\\' + keyword)
    return text


def convert_one(doc_id: int) -> tuple[int, str] | None:
    """Convert single RTF file to text. Returns (doc_id, text) or None."""
    filepath = RTF_DIR / f"{doc_id}.rtf"
    try:
        raw = filepath.read_bytes()
    except (IOError, OSError):
        return None

    text = raw.decode('latin1')
    for kw in ['fonttbl', 'colortbl', 'stylesheet', 'info', '*\\']:
        text = remove_nested_group(text, kw)
    text = re.sub(r'\\rtf1[^\\{]*', '', text)
    text = re.sub(r'\\par\b', '\n', text)
    text = re.sub(r'\\line\b', '\n', text)
    text = re.sub(r'\\tab\b', '\t', text)
    text = re.sub(r"\\'([0-9a-fA-F]{2})", decode_win1251_byte, text)
    text = re.sub(r"\\u(-?\d+) ?(?:\\'[0-9a-fA-F]{2}|[^\\{} \n])?", decode_unicode, text)
    text = text.replace('\\~', ' ').replace('\\_', '-').replace('\\-', '')  # RTF control symbols
    text = re.sub(r'\\[a-zA-Z]+-?\d*\s?', '', text)
    text = text.replace('{', '').replace('}', '')
    text = text.replace('\x00', '')
    text = text.replace('\r\n', '\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return (doc_id, text) if text else None


def psql_copy_upsert(csv_data: str) -> int:
    """
    COPY CSV into edrsr_fulltext via stdin, using temp table + ON CONFLICT.
    Sends SQL + CSV data in a single psql stdin session.
    """
    # Build a SQL script that:
    # 1. Creates temp table
    # 2. COPYs from stdin
    # 3. Inserts with ON CONFLICT
    # psql reads commands from stdin; COPY ... FROM STDIN reads data until \.

    # Build COPY data block (tab-separated for simplicity in stdin mode)
    lines = []
    reader = csv.reader(io.StringIO(csv_data))
    for row in reader:
        if len(row) == 2:
            doc_id, text = row
            # Escape backslashes and special chars for COPY text format
            text = text.replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '')
            lines.append(f"{doc_id}\t{text}")

    if not lines:
        return 0

    copy_block = '\n'.join(lines)

    sql_script = f"""CREATE TEMP TABLE _ft_tmp (doc_id bigint, full_text text);
COPY _ft_tmp FROM stdin;
{copy_block}
\\.
INSERT INTO edrsr_fulltext(doc_id, full_text)
SELECT doc_id, full_text FROM _ft_tmp
ON CONFLICT (doc_id) DO NOTHING;
DROP TABLE _ft_tmp;
"""
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB]
    r = subprocess.run(cmd, input=sql_script, capture_output=True, text=True)

    if r.returncode != 0:
        # Check if it's just a partial error
        if 'ERROR' in r.stderr:
            print(f"  psql error: {r.stderr[:300]}", file=sys.stderr)
            return 0

    # Parse INSERT count
    for line in r.stdout.strip().split('\n'):
        if line.startswith('INSERT '):
            try:
                return int(line.split()[2])
            except (IndexError, ValueError):
                pass
    return len(lines)  # fallback


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=12, help='CPU workers for RTF conversion')
    parser.add_argument('--batch', type=int, default=2000, help='DB COPY batch size')
    args = parser.parse_args()

    print(f"=== Parallel RTF Import ===")
    print(f"Workers: {args.workers}, Batch: {args.batch}, CPUs: {cpu_count()}")
    print()

    # 1. Get downloaded RTF doc_ids
    print("[1/3] Scanning RTF directory...")
    all_ids = set()
    for entry in os.scandir(RTF_DIR):
        if entry.name.endswith('.rtf') and entry.stat().st_size > 0:
            try:
                all_ids.add(int(entry.name[:-4]))
            except ValueError:
                pass
    print(f"  RTF files on disk: {len(all_ids)}")

    # 2. Get already imported
    print("[2/3] Checking already imported...")
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc",
           "SELECT doc_id FROM edrsr_fulltext WHERE doc_id >= 133000000;"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    existing = {int(x) for x in r.stdout.strip().split('\n') if x}
    print(f"  Already in DB: {len(existing)}")

    # Only import doc_ids >= 133000000 (2025-2026 range)
    to_import = sorted(id for id in (all_ids - existing) if id >= 133000000)
    print(f"  To convert+import: {len(to_import)}")

    if not to_import:
        print("Nothing to import!")
        return

    # 3. Process in batches with multiprocessing
    print(f"[3/3] Converting + importing ({args.workers} workers)...")
    total_imported = 0
    total_batches = (len(to_import) + args.batch - 1) // args.batch
    start = time.time()

    with Pool(processes=args.workers) as pool:
        for batch_idx in range(total_batches):
            batch_start = batch_idx * args.batch
            batch_ids = to_import[batch_start: batch_start + args.batch]

            # Parallel RTF→text conversion
            results = pool.map(convert_one, batch_ids, chunksize=50)

            # Build CSV in memory
            buf = io.StringIO()
            writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
            converted = 0
            for r in results:
                if r is not None:
                    writer.writerow(r)
                    converted += 1

            # COPY to PG with ON CONFLICT
            if converted > 0:
                copied = psql_copy_upsert(buf.getvalue())
                total_imported += copied

            if (batch_idx + 1) % 10 == 0 or batch_idx == total_batches - 1:
                elapsed = time.time() - start
                rate = total_imported / elapsed if elapsed > 0 else 0
                done_ids = batch_start + len(batch_ids)
                remaining = len(to_import) - done_ids
                eta = remaining / rate if rate > 0 else 0
                print(f"  Batch {batch_idx+1}/{total_batches} | "
                      f"{total_imported} imported | {rate:.0f}/s | ETA {eta/60:.1f}m")

    elapsed = time.time() - start
    print(f"\n=== Done! {total_imported} records in {elapsed:.0f}s ({total_imported/elapsed:.0f}/s) ===")

    # Verify
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-c",
           """SELECT extract(year from d.adjudication_date)::int AS year,
                     count(d.doc_id) AS total_docs,
                     count(ft.doc_id) AS with_fulltext,
                     round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 1) AS pct
              FROM edrsr_documents d
              LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
              WHERE d.adjudication_date >= '2025-01-01'
                AND extract(year from d.adjudication_date) <= 2026
              GROUP BY 1 ORDER BY 1;"""]
    subprocess.run(cmd)


if __name__ == '__main__':
    main()
