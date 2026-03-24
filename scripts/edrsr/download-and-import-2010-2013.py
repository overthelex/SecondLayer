#!/usr/bin/env python3
"""
Download RTF full texts for 2010-2013 from reyestr.court.gov.ua and import into edrsr_fulltext.
Uses asyncio for downloads, multiprocessing for RTF→text, COPY for DB import.

Run all 4 years in parallel:
  python3 download-and-import-2010-2013.py --year 2010 --workers 200 &
  python3 download-and-import-2010-2013.py --year 2011 --workers 200 &
  python3 download-and-import-2010-2013.py --year 2012 --workers 200 &
  python3 download-and-import-2010-2013.py --year 2013 --workers 200 &
  wait

Single year:
  python3 download-and-import-2010-2013.py --year 2010 --workers 200

All years sequentially:
  python3 download-and-import-2010-2013.py --workers 200

Skip download (import only from existing RTFs):
  python3 download-and-import-2010-2013.py --year 2010 --skip-download --import-workers 12
"""
import asyncio
import aiohttp
import csv
import gc
import io
import os
import re
import subprocess
import sys
import time
import argparse
from pathlib import Path
from multiprocessing import Pool

csv.field_size_limit(sys.maxsize)

# ── Config ──
BASE_RTF_DIR = Path("/data/edrsr")
CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"
MAX_RTF_SIZE = 50 * 1024 * 1024  # 50MB


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
        size = filepath.stat().st_size
        if size > MAX_RTF_SIZE or size == 0:
            return None
        raw = filepath.read_bytes()
    except (IOError, OSError):
        return None

    doc_id = int(filepath.stem)

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
            f"[{done:,}/{self.total:,}] ({pct:.1f}%) "
            f"ok={self.downloaded:,} fail={self.failed:,} skip={self.skipped:,} | "
            f"{rate:.0f}/s | ETA {eta/60:.0f}m"
        )


async def download_one(
    session: aiohttp.ClientSession,
    doc_id: int,
    url: str,
    rtf_dir: Path,
    stats: Stats,
    semaphore: asyncio.Semaphore,
):
    outpath = rtf_dir / f"{doc_id}.rtf"
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


async def download_all(items: list[tuple[int, str]], rtf_dir: Path, workers: int):
    """Download all RTFs with asyncio."""
    stats = Stats(len(items))
    semaphore = asyncio.Semaphore(workers)

    connector = aiohttp.TCPConnector(limit=workers, limit_per_host=workers)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [download_one(session, doc_id, url, rtf_dir, stats, semaphore) for doc_id, url in items]

        async def progress():
            while True:
                await asyncio.sleep(30)
                print(f"    {stats.report()}", flush=True)

        prog_task = asyncio.create_task(progress())
        # Process in batches of 500K to avoid memory issues
        batch_size = 500_000
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            await asyncio.gather(*batch)
            done = min(i + batch_size, len(tasks))
            print(f"    Batch {done:,}/{len(tasks):,} done: {stats.report()}", flush=True)
        prog_task.cancel()

    return stats


def process_year(year: int, args):
    """Download + import for a single year."""
    rtf_dir = BASE_RTF_DIR / f"rtf{year}"
    year_filter = f"adjudication_date >= '{year}-01-01' AND adjudication_date < '{year + 1}-01-01'"

    print(f"\n{'='*60}")
    print(f"  YEAR {year}")
    print(f"{'='*60}")
    print(f"  RTF dir: {rtf_dir}")
    print(f"  Download workers: {args.workers}, Import workers: {args.import_workers}")
    print(flush=True)

    rtf_dir.mkdir(parents=True, exist_ok=True)

    if not args.skip_download:
        # Step 1: Get missing doc_ids with URLs
        print(f"  [{year}] [1/4] Querying missing doc_id + doc_url from PG...", flush=True)
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

        print(f"  [{year}] Missing docs with URLs: {len(items):,}", flush=True)

        if items:
            # Step 2: Filter already on disk
            print(f"  [{year}] [2/4] Filtering already downloaded...", flush=True)
            to_download = []
            for doc_id, url in items:
                p = rtf_dir / f"{doc_id}.rtf"
                if not p.exists() or p.stat().st_size == 0:
                    to_download.append((doc_id, url))
            on_disk = len(items) - len(to_download)
            print(f"  [{year}] Already on disk: {on_disk:,}", flush=True)
            print(f"  [{year}] To download: {len(to_download):,}", flush=True)

            # Step 3: Download
            if to_download:
                print(f"  [{year}] [3/4] Downloading {len(to_download):,} RTFs ({args.workers} concurrent)...", flush=True)
                dl_start = time.time()
                stats = asyncio.run(download_all(to_download, rtf_dir, args.workers))
                elapsed = time.time() - dl_start
                rate = stats.downloaded / elapsed if elapsed > 0 else 0
                print(f"  [{year}] Download done: {stats.downloaded:,} ok, {stats.failed:,} failed "
                      f"in {elapsed/60:.1f}m ({rate:.0f}/s)", flush=True)
            else:
                print(f"  [{year}] [3/4] All files already downloaded", flush=True)
        else:
            print(f"  [{year}] Nothing to download!", flush=True)

    if args.skip_import:
        print(f"  [{year}] Skipping import (--skip-import)")
        return

    # Step 4: Import to local PG
    print(f"  [{year}] [4/4] Importing RTFs to PG ({args.import_workers} workers, batch {args.batch})...", flush=True)

    # Scan RTF dir
    print(f"  [{year}] Scanning RTF dir...", flush=True)
    all_doc_ids = []
    for entry in os.scandir(rtf_dir):
        if entry.name.endswith('.rtf'):
            try:
                all_doc_ids.append(int(entry.name[:-4]))
            except ValueError:
                pass
    print(f"  [{year}] RTF files on disk: {len(all_doc_ids):,}", flush=True)

    if not all_doc_ids:
        print(f"  [{year}] No RTF files to import!")
        return

    # Get already imported
    print(f"  [{year}] Checking already imported...", flush=True)
    min_id, max_id = min(all_doc_ids), max(all_doc_ids)
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
    print(f"  [{year}] Already in DB: {len(existing):,}", flush=True)

    to_import_ids = sorted(set(all_doc_ids) - existing)
    del all_doc_ids, existing
    gc.collect()

    print(f"  [{year}] To convert+import: {len(to_import_ids):,}", flush=True)

    if not to_import_ids:
        print(f"  [{year}] Nothing to import!")
        return

    to_import_files = [f"{rtf_dir}/{doc_id}.rtf" for doc_id in to_import_ids]
    total_files = len(to_import_files)
    del to_import_ids
    gc.collect()

    total_imported = 0
    total_batches = (total_files + args.batch - 1) // args.batch
    start = time.time()

    with Pool(processes=args.import_workers) as pool:
        for batch_idx in range(total_batches):
            batch_start = batch_idx * args.batch
            batch_files = to_import_files[batch_start:batch_start + args.batch]

            results = pool.map(convert_one_file, batch_files, chunksize=50)

            buf = io.StringIO()
            writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
            converted = 0
            for res in results:
                if res is not None:
                    writer.writerow(res)
                    converted += 1

            if converted > 0:
                copied = psql_copy_upsert(buf.getvalue())
                total_imported += copied

            if (batch_idx + 1) % 20 == 0 or batch_idx == total_batches - 1:
                elapsed = time.time() - start
                rate = total_imported / elapsed if elapsed > 0 else 0
                done_files = min(batch_start + len(batch_files), total_files)
                pct = 100.0 * done_files / total_files
                remaining = total_files - done_files
                eta = remaining / rate if rate > 0 else 0
                print(f"  [{year}] {batch_idx+1}/{total_batches} ({pct:.1f}%) | "
                      f"{total_imported:,} imported | {rate:.0f}/s | ETA {eta/60:.0f}m",
                      flush=True)

    elapsed = time.time() - start
    rate = total_imported / elapsed if elapsed > 0 else 0
    print(f"\n  [{year}] === Done! {total_imported:,} records in {elapsed/60:.1f}m ({rate:.0f}/s) ===", flush=True)


def main():
    parser = argparse.ArgumentParser(description='Download & import EDRSR fulltexts for 2010-2013')
    parser.add_argument('--year', type=int, default=None, help='Single year (2010-2013). If omitted, processes all.')
    parser.add_argument('--workers', type=int, default=200, help='Parallel downloads (default: 200)')
    parser.add_argument('--import-workers', type=int, default=12, help='CPU workers for RTF conversion (default: 12)')
    parser.add_argument('--batch', type=int, default=5000, help='DB import batch size (default: 5000)')
    parser.add_argument('--skip-download', action='store_true', help='Skip download, only import')
    parser.add_argument('--skip-import', action='store_true', help='Skip import, only download')
    args = parser.parse_args()

    print("=== ЄДРСР Fulltext Download & Import (2010-2013) ===")
    print(f"Download workers: {args.workers}, Import workers: {args.import_workers}")
    print(flush=True)

    years = [args.year] if args.year else [2010, 2011, 2012, 2013]
    global_start = time.time()

    for year in years:
        process_year(year, args)

    elapsed = time.time() - global_start
    print(f"\n{'='*60}")
    print(f"  ALL YEARS DONE in {elapsed/60:.1f}m")
    print(f"{'='*60}")

    # Final verification
    print("\nVerification:", flush=True)
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-c",
           f"""SELECT extract(year from d.adjudication_date)::int AS year,
                      count(d.doc_id) AS total_docs,
                      count(ft.doc_id) AS with_fulltext,
                      round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 1) AS pct
               FROM edrsr_documents d
               LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
               WHERE d.adjudication_date >= '2010-01-01' AND d.adjudication_date < '2014-01-01'
               GROUP BY 1 ORDER BY 1;"""]
    subprocess.run(cmd)


if __name__ == '__main__':
    main()
