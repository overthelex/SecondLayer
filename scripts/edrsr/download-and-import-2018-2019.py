#!/usr/bin/env python3
"""
Download RTF full texts for 2018-2019 from reyestr.court.gov.ua and import into edrsr_fulltext.
Uses asyncio for downloads, multiprocessing for RTF→text, COPY for DB import.

Usage:
  python3 download-and-import-2018-2019.py --workers 200 --batch 5000
  python3 download-and-import-2018-2019.py --skip-download --import-workers 12
"""
import asyncio
import aiohttp
import csv
import io
import os
import re
import subprocess
import sys
import time
import argparse
from pathlib import Path
from multiprocessing import Pool, cpu_count

csv.field_size_limit(sys.maxsize)

# ── Config ──
RTF_DIR = Path("/tmp/edrsr-rtf-2018-2019")
CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"
YEAR_FILTER = "adjudication_date >= '2018-01-01' AND adjudication_date < '2020-01-01'"


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


def convert_one_file(filepath_str: str) -> tuple[int, str] | None:
    """Convert single RTF file to (doc_id, text)."""
    filepath = Path(filepath_str)
    try:
        raw = filepath.read_bytes()
    except (IOError, OSError):
        return None

    doc_id = int(filepath.stem)
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


def psql_copy_upsert(csv_data: str) -> int:
    """COPY CSV into edrsr_fulltext via stdin with temp table + ON CONFLICT."""
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


# ── Download ──
class Stats:
    def __init__(self, total: int):
        self.total = total
        self.downloaded = 0
        self.failed = 0
        self.skipped = 0
        self.start = time.time()
        self.lock = asyncio.Lock()

    async def inc(self, field: str, n: int = 1):
        async with self.lock:
            setattr(self, field, getattr(self, field) + n)

    def report(self) -> str:
        elapsed = time.time() - self.start
        done = self.downloaded + self.failed + self.skipped
        rate = self.downloaded / elapsed if elapsed > 0 else 0
        remaining = self.total - done
        eta = remaining / rate if rate > 0 else 0
        pct = 100.0 * done / self.total if self.total else 0
        return (
            f"  [{done:,}/{self.total:,}] ({pct:.1f}%) "
            f"ok={self.downloaded:,} fail={self.failed:,} skip={self.skipped:,} | "
            f"{rate:.0f}/s | ETA {eta/60:.0f}m"
        )


async def download_one(
    session: aiohttp.ClientSession,
    doc_id: int,
    url: str,
    stats: Stats,
    semaphore: asyncio.Semaphore,
):
    outpath = RTF_DIR / f"{doc_id}.rtf"
    if outpath.exists() and outpath.stat().st_size > 0:
        await stats.inc('skipped')
        return

    async with semaphore:
        for attempt in range(3):
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 200:
                        data = await resp.read()
                        if data:
                            outpath.write_bytes(data)
                            await stats.inc('downloaded')
                            return
                    elif resp.status == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    elif resp.status in (404, 403):
                        await stats.inc('failed')
                        return
            except Exception:
                pass
            await asyncio.sleep(1 * (attempt + 1))

        await stats.inc('failed')


async def download_batch(items: list[tuple[int, str]], workers: int, batch_num: int, total_batches: int):
    """Download a batch of RTFs."""
    stats = Stats(len(items))
    semaphore = asyncio.Semaphore(workers)

    connector = aiohttp.TCPConnector(limit=workers, limit_per_host=workers)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [download_one(session, doc_id, url, stats, semaphore) for doc_id, url in items]

        async def progress():
            while True:
                await asyncio.sleep(30)
                print(f"  Batch {batch_num}/{total_batches}: {stats.report()}", flush=True)

        prog_task = asyncio.create_task(progress())
        await asyncio.gather(*tasks)
        prog_task.cancel()

    return stats


# ── Main ──
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=200, help='Parallel downloads')
    parser.add_argument('--import-workers', type=int, default=12, help='CPU workers for RTF conversion')
    parser.add_argument('--batch', type=int, default=5000, help='DB import batch size')
    parser.add_argument('--download-batch', type=int, default=500000, help='Download batch size')
    parser.add_argument('--skip-download', action='store_true', help='Skip download, only import')
    parser.add_argument('--skip-import', action='store_true', help='Skip import, only download')
    parser.add_argument('--year', type=int, default=None, help='Single year (2018 or 2019)')
    args = parser.parse_args()

    RTF_DIR.mkdir(parents=True, exist_ok=True)

    year_filter = YEAR_FILTER
    if args.year:
        year_filter = f"adjudication_date >= '{args.year}-01-01' AND adjudication_date < '{args.year + 1}-01-01'"

    print("=== ЄДРСР Fulltext Download & Import (2018-2019) ===")
    print(f"Download workers: {args.workers}, Import workers: {args.import_workers}")
    print(f"RTF dir: {RTF_DIR}")
    print(flush=True)

    if not args.skip_download:
        # Step 1: Get missing doc_ids with URLs
        print("[1/4] Querying missing doc_id + doc_url from PG...", flush=True)
        cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc",
               f"""SELECT d.doc_id || '|' || d.doc_url
                   FROM edrsr_documents d
                   LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
                   WHERE {year_filter}
                     AND d.doc_url IS NOT NULL AND d.doc_url != ''
                     AND ft.doc_id IS NULL
                   ORDER BY d.doc_id;"""]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

        items = []
        for line in r.stdout.strip().split('\n'):
            if '|' in line:
                parts = line.split('|', 1)
                if len(parts) == 2:
                    try:
                        items.append((int(parts[0]), parts[1]))
                    except ValueError:
                        pass

        print(f"  Missing docs with URLs: {len(items):,}", flush=True)

        if not items:
            print("Nothing to download!")
            if not args.skip_import:
                pass  # still try import from existing files
            else:
                return

        # Step 2: Filter already on disk
        print("[2/4] Filtering already downloaded...", flush=True)
        before = len(items)
        to_download = []
        for doc_id, url in items:
            p = RTF_DIR / f"{doc_id}.rtf"
            if not p.exists() or p.stat().st_size == 0:
                to_download.append((doc_id, url))
        skipped = before - len(to_download)
        print(f"  Already on disk: {skipped:,}", flush=True)
        print(f"  To download: {len(to_download):,}", flush=True)

        # Step 3: Download in batches
        if to_download:
            total_batches = (len(to_download) + args.download_batch - 1) // args.download_batch
            print(f"[3/4] Downloading {len(to_download):,} RTFs ({args.workers} concurrent, {total_batches} batches)...", flush=True)
            total_ok = 0
            total_fail = 0
            dl_start = time.time()

            for batch_idx in range(total_batches):
                batch_start = batch_idx * args.download_batch
                batch_items = to_download[batch_start:batch_start + args.download_batch]
                stats = asyncio.run(download_batch(batch_items, args.workers, batch_idx + 1, total_batches))
                total_ok += stats.downloaded
                total_fail += stats.failed
                elapsed = time.time() - dl_start
                rate = total_ok / elapsed if elapsed > 0 else 0
                print(f"  Batch {batch_idx+1}/{total_batches} done: +{stats.downloaded:,} ok, +{stats.failed:,} fail | "
                      f"Total: {total_ok:,} ok ({rate:.0f}/s)", flush=True)

            elapsed = time.time() - dl_start
            print(f"\n  Download complete: {total_ok:,} ok, {total_fail:,} failed in {elapsed/60:.1f}m", flush=True)
        else:
            print("[3/4] All files already downloaded", flush=True)

    if args.skip_import:
        print("Skipping import (--skip-import)")
        return

    # Step 4: Import to local PG
    print(f"\n[4/4] Importing RTFs to local PG ({args.import_workers} workers, batch {args.batch})...", flush=True)

    # Get all downloaded files — just collect (doc_id, filepath) as lightweight list
    print("  Scanning RTF dir...", flush=True)
    all_doc_ids = []
    rtf_dir_str = str(RTF_DIR)
    for entry in os.scandir(RTF_DIR):
        if entry.name.endswith('.rtf'):
            try:
                doc_id = int(entry.name[:-4])
                all_doc_ids.append(doc_id)
            except ValueError:
                pass
    print(f"  RTF files on disk: {len(all_doc_ids):,}", flush=True)

    # Get already imported
    print("  Checking already imported...", flush=True)
    if all_doc_ids:
        min_id = min(all_doc_ids)
        max_id = max(all_doc_ids)
        cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc",
               f"SELECT doc_id FROM edrsr_fulltext WHERE doc_id BETWEEN {min_id} AND {max_id};"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        existing = {int(x) for x in r.stdout.strip().split('\n') if x}
    else:
        existing = set()
    print(f"  Already in DB: {len(existing):,}", flush=True)

    to_import_ids = sorted(set(all_doc_ids) - existing)
    # Free memory before fork
    del all_doc_ids, existing
    import gc; gc.collect()

    print(f"  To convert+import: {len(to_import_ids):,}", flush=True)

    if not to_import_ids:
        print("Nothing to import!")
        return

    # Build file paths as simple strings (minimal memory)
    to_import_files = [f"{rtf_dir_str}/{doc_id}.rtf" for doc_id in to_import_ids]
    del to_import_ids
    gc.collect()

    # Process in batches with multiprocessing
    total_imported = 0
    total_batches = (len(to_import_files) + args.batch - 1) // args.batch
    start = time.time()

    with Pool(processes=args.import_workers) as pool:
        for batch_idx in range(total_batches):
            batch_start = batch_idx * args.batch
            batch_files = to_import_files[batch_start:batch_start + args.batch]

            # Parallel RTF→text
            results = pool.map(convert_one_file, batch_files, chunksize=50)

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
                done_ids = batch_start + len(batch_files)
                pct = 100.0 * done_ids / len(to_import_ids)
                remaining = len(to_import_ids) - done_ids
                eta = remaining / rate if rate > 0 else 0
                print(f"  Batch {batch_idx+1}/{total_batches} ({pct:.1f}%) | "
                      f"{total_imported:,} imported | {rate:.0f}/s | ETA {eta/60:.0f}m",
                      flush=True)

    elapsed = time.time() - start
    rate = total_imported / elapsed if elapsed > 0 else 0
    print(f"\n=== Import done! {total_imported:,} records in {elapsed/60:.1f}m ({rate:.0f}/s) ===", flush=True)

    # Verify
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-c",
           f"""SELECT extract(year from d.adjudication_date)::int AS year,
                      count(d.doc_id) AS total_docs,
                      count(ft.doc_id) AS with_fulltext,
                      round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 1) AS pct
               FROM edrsr_documents d
               LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
               WHERE {year_filter}
               GROUP BY 1 ORDER BY 1;"""]
    subprocess.run(cmd)


if __name__ == '__main__':
    main()
