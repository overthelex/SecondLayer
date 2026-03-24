#!/usr/bin/env python3
"""
Minimal RTF→PG import. No asyncio, no large dicts.
Reads file list from stdin or scans directory.

Usage:
  python3 import-rtf-fast.py --rtf-dir /tmp/edrsr-rtf-2018-2019 --workers 12 --batch 5000
"""
import csv
import io
import os
import re
import subprocess
import sys
import time
import argparse
from multiprocessing import Pool
from pathlib import Path

csv.field_size_limit(sys.maxsize)

CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"


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


MAX_RTF_SIZE = 50 * 1024 * 1024  # 50MB - skip huge files


def convert_one(filepath: str) -> tuple[int, str] | None:
    try:
        size = os.path.getsize(filepath)
        if size > MAX_RTF_SIZE:
            return None
        raw = Path(filepath).read_bytes()
    except (IOError, OSError):
        return None
    doc_id = int(Path(filepath).stem)

    # Skip non-RTF files (HTML responses from server errors etc)
    if not raw[:20].startswith(b'{\\rtf'):
        return None

    text = raw.decode('latin1')
    for kw in ['fonttbl', 'colortbl', 'stylesheet', 'info', '*\\']:
        text = remove_nested_group(text, kw)
    text = re.sub(r'\\rtf1[^\\{]*', '', text)
    text = re.sub(r'\\par\b', '\n', text)
    text = re.sub(r'\\line\b', '\n', text)
    text = re.sub(r'\\tab\b', '\t', text)
    text = re.sub(r"\\'([0-9a-fA-F]{2})", decode_win1251_byte, text)
    text = re.sub(r'\\u(\d+)\??', decode_unicode, text)
    text = re.sub(r'\\[a-zA-Z]+-?\d*\s?', '', text)
    text = text.replace('{', '').replace('}', '')
    text = text.replace('\x00', '')
    text = text.replace('\r\n', '\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    text = text.encode('utf-8', errors='surrogatepass').decode('utf-8', errors='replace')
    return (doc_id, text) if text else None


def psql_copy(csv_data: str) -> int:
    lines = []
    reader = csv.reader(io.StringIO(csv_data))
    for row in reader:
        if len(row) == 2:
            doc_id, text = row
            text = text.replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '')
            lines.append(f"{doc_id}\t{text}")
    if not lines:
        return 0
    copy_block = '\n'.join(lines)
    sql = f"""CREATE TEMP TABLE _ft_tmp (doc_id bigint, full_text text);
COPY _ft_tmp FROM stdin;
{copy_block}
\\.
INSERT INTO edrsr_fulltext(doc_id, full_text)
SELECT doc_id, full_text FROM _ft_tmp
ON CONFLICT (doc_id) DO NOTHING;
DROP TABLE _ft_tmp;
"""
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB]
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True)
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
    parser.add_argument('--rtf-dir', required=True)
    parser.add_argument('--workers', type=int, default=12)
    parser.add_argument('--batch', type=int, default=5000)
    args = parser.parse_args()

    rtf_dir = args.rtf_dir

    print(f"=== RTF Import → PG ===")
    print(f"Workers: {args.workers}, Batch: {args.batch}, Dir: {rtf_dir}")
    print(flush=True)

    # Scan dir — collect only doc_ids as integers (minimal memory)
    print("[1/3] Scanning...", flush=True)
    doc_ids = []
    for entry in os.scandir(rtf_dir):
        if entry.name.endswith('.rtf'):
            try:
                doc_ids.append(int(entry.name[:-4]))
            except ValueError:
                pass
    print(f"  Files: {len(doc_ids):,}", flush=True)

    # Check existing
    print("[2/3] Checking DB...", flush=True)
    min_id, max_id = min(doc_ids), max(doc_ids)
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc",
           f"SELECT doc_id FROM edrsr_fulltext WHERE doc_id BETWEEN {min_id} AND {max_id};"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    existing = set()
    for line in r.stdout.split('\n'):
        line = line.strip()
        if line:
            try:
                existing.add(int(line))
            except ValueError:
                pass
    print(f"  Existing: {len(existing):,}", flush=True)

    to_import = sorted(set(doc_ids) - existing)
    # Free memory
    del doc_ids, existing, r
    print(f"  To import: {len(to_import):,}", flush=True)

    if not to_import:
        print("Nothing to import!")
        return

    # Build minimal file path list
    files = [f"{rtf_dir}/{did}.rtf" for did in to_import]
    del to_import

    # Import
    print(f"[3/3] Importing ({args.workers} workers)...", flush=True)
    total = 0
    n_batches = (len(files) + args.batch - 1) // args.batch
    start = time.time()

    with Pool(args.workers) as pool:
        for i in range(n_batches):
            batch = files[i * args.batch : (i + 1) * args.batch]

            # Use apply_async with timeout to avoid hanging on bad files
            async_results = [pool.apply_async(convert_one, (f,)) for f in batch]

            buf = io.StringIO()
            writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
            n = 0
            skipped = 0
            for ar in async_results:
                try:
                    res = ar.get(timeout=30)  # 30s max per file
                    if res:
                        writer.writerow(res)
                        n += 1
                except Exception:
                    skipped += 1

            if n:
                total += psql_copy(buf.getvalue())

            if (i + 1) % 10 == 0 or i == n_batches - 1:
                elapsed = time.time() - start
                rate = total / elapsed if elapsed > 0 else 0
                done = (i + 1) * args.batch
                if done > len(files):
                    done = len(files)
                pct = 100.0 * done / len(files)
                rem = len(files) - done
                eta = rem / rate if rate > 0 else 0
                print(f"  {i+1}/{n_batches} ({pct:.1f}%) | {total:,} imported | {rate:.0f}/s | ETA {eta/60:.0f}m", flush=True)

    elapsed = time.time() - start
    rate = total / elapsed if elapsed > 0 else 0
    print(f"\n=== Done! {total:,} in {elapsed/60:.1f}m ({rate:.0f}/s) ===")


if __name__ == '__main__':
    main()
