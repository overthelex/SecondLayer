#!/usr/bin/env python3
"""
Parallel RTF→text conversion + PG import for edrsr_fulltext.
Reads RTF files from HDD, converts with multiprocessing, imports via COPY.

Usage: python3 import-fulltext-from-hdd.py --rtf-dir /path/to/rtf [--workers 12] [--batch 2000]
       python3 import-fulltext-from-hdd.py --rtf-dirs /path/to/rtf2023 /path/to/rtf2024
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

CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"

# Will be set by main()
RTF_DIRS: list[Path] = []


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


# Global for multiprocessing workers
_rtf_lookup: dict[int, Path] = {}

def _init_worker(lookup: dict[int, Path]):
    global _rtf_lookup
    _rtf_lookup = lookup


def convert_one(doc_id: int) -> tuple[int, str] | None:
    """Convert single RTF file to text."""
    global _rtf_lookup
    filepath = _rtf_lookup.get(doc_id)
    if not filepath:
        return None
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


MAX_TEXT_SIZE = 5_000_000  # 5MB max per document


def psql_copy_upsert(csv_data: str) -> int:
    """COPY CSV into edrsr_fulltext via stdin with temp table + ON CONFLICT."""
    lines = []
    reader = csv.reader(io.StringIO(csv_data))
    for row in reader:
        if len(row) == 2:
            doc_id, text = row
            if len(text) > MAX_TEXT_SIZE:
                text = text[:MAX_TEXT_SIZE]
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
    try:
        r = subprocess.run(cmd, input=sql_script, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        print(f"  psql timeout on batch", file=sys.stderr)
        return 0
    except Exception as e:
        print(f"  psql exception: {e}", file=sys.stderr)
        return 0

    if r.returncode != 0 and 'ERROR' in r.stderr:
        print(f"  psql error: {r.stderr[:300]}", file=sys.stderr)
        return 0

    for line in r.stdout.strip().split('\n'):
        if line.startswith('INSERT '):
            try:
                return int(line.split()[2])
            except (IndexError, ValueError):
                pass
    return len(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rtf-dirs', nargs='+', required=True, help='RTF directories to import from')
    parser.add_argument('--workers', type=int, default=12, help='CPU workers')
    parser.add_argument('--batch', type=int, default=2000, help='DB batch size')
    args = parser.parse_args()

    rtf_dirs = [Path(d) for d in args.rtf_dirs]

    print(f"=== Parallel RTF Import (HDD) ===")
    print(f"Workers: {args.workers}, Batch: {args.batch}, CPUs: {cpu_count()}")
    print(f"RTF dirs: {[str(d) for d in rtf_dirs]}")
    print(flush=True)

    # 1. Scan all RTF directories (no stat() — too slow on HDD with millions of files)
    print("[1/3] Scanning RTF directories...", flush=True)
    rtf_lookup: dict[int, Path] = {}
    for rtf_dir in rtf_dirs:
        dir_count = 0
        for entry in os.scandir(rtf_dir):
            if entry.name.endswith('.rtf'):
                try:
                    doc_id = int(entry.name[:-4])
                    rtf_lookup[doc_id] = rtf_dir / entry.name
                    dir_count += 1
                except ValueError:
                    pass
        print(f"  {rtf_dir.name}: {dir_count:,} files", flush=True)

    print(f"  Total RTF files: {len(rtf_lookup):,}", flush=True)

    # 2. Get already imported doc_ids in this range
    print("[2/3] Checking already imported...", flush=True)
    min_id = min(rtf_lookup.keys())
    max_id = max(rtf_lookup.keys())
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc",
           f"SELECT doc_id FROM edrsr_fulltext WHERE doc_id BETWEEN {min_id} AND {max_id};"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    existing = {int(x) for x in r.stdout.strip().split('\n') if x}
    print(f"  Already in DB: {len(existing):,}", flush=True)

    to_import = sorted(set(rtf_lookup.keys()) - existing)
    print(f"  To convert+import: {len(to_import):,}", flush=True)

    if not to_import:
        print("Nothing to import!")
        return

    # 3. Process in batches
    print(f"[3/3] Converting + importing ({args.workers} workers)...", flush=True)
    total_imported = 0
    total_batches = (len(to_import) + args.batch - 1) // args.batch
    start = time.time()

    # Workers need access to rtf_lookup — use initializer
    with Pool(processes=args.workers, initializer=_init_worker, initargs=(rtf_lookup,)) as pool:
        for batch_idx in range(total_batches):
            batch_start = batch_idx * args.batch
            batch_ids = to_import[batch_start: batch_start + args.batch]

            # Parallel RTF→text
            results = pool.map(convert_one, batch_ids, chunksize=50)

            # Build CSV
            buf = io.StringIO()
            writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
            converted = 0
            for res in results:
                if res is not None:
                    writer.writerow(res)
                    converted += 1

            # COPY to PG
            if converted > 0:
                copied = psql_copy_upsert(buf.getvalue())
                total_imported += copied

            if (batch_idx + 1) % 20 == 0 or batch_idx == total_batches - 1:
                elapsed = time.time() - start
                rate = total_imported / elapsed if elapsed > 0 else 0
                done_ids = batch_start + len(batch_ids)
                remaining = len(to_import) - done_ids
                eta = remaining / rate if rate > 0 else 0
                pct = 100.0 * done_ids / len(to_import)
                print(f"  Batch {batch_idx+1}/{total_batches} ({pct:.1f}%) | "
                      f"{total_imported:,} imported | {rate:.0f}/s | ETA {eta/60:.0f}m",
                      flush=True)

    elapsed = time.time() - start
    rate = total_imported / elapsed if elapsed > 0 else 0
    print(f"\n=== Done! {total_imported:,} records in {elapsed/60:.1f}m ({rate:.0f}/s) ===", flush=True)

    # Verify
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-c",
           """SELECT extract(year from d.adjudication_date)::int AS year,
                     count(d.doc_id) AS total_docs,
                     count(ft.doc_id) AS with_fulltext,
                     round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 1) AS pct
              FROM edrsr_documents d
              LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
              WHERE d.adjudication_date >= '2023-01-01'
                AND extract(year from d.adjudication_date) <= 2024
              GROUP BY 1 ORDER BY 1;"""]
    subprocess.run(cmd)


if __name__ == '__main__':
    main()
