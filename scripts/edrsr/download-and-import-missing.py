#!/usr/bin/env python3
"""
Download missing RTF full texts for any year and import into edrsr_fulltext.
Uses asyncio for downloads, multiprocessing for RTF→text, COPY for DB import.

Usage (parallel by year):
  for y in 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024; do
    python3 download-and-import-missing.py --year $y --workers 100 &
  done
  wait

Single year:
  python3 download-and-import-missing.py --year 2019 --workers 200
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

CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"
MAX_RTF_SIZE = 50 * 1024 * 1024


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
    filepath = Path(filepath_str)
    try:
        size = filepath.stat().st_size
        if size > MAX_RTF_SIZE or size == 0:
            return None
        raw = filepath.read_bytes()
    except (IOError, OSError):
        return None

    doc_id = int(filepath.stem)
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


async def download_one(session, doc_id, url, rtf_dir, stats, semaphore):
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


async def download_all(items, rtf_dir, workers):
    stats = Stats(len(items))
    semaphore = asyncio.Semaphore(workers)
    connector = aiohttp.TCPConnector(limit=workers, limit_per_host=workers)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [download_one(session, did, url, rtf_dir, stats, semaphore) for did, url in items]
        async def progress():
            while True:
                await asyncio.sleep(30)
                print(f"    {stats.report()}", flush=True)
        prog_task = asyncio.create_task(progress())
        batch_size = 500_000
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            await asyncio.gather(*batch)
        prog_task.cancel()
    return stats


def process_year(year: int, args):
    rtf_dir = Path(f"/tmp/edrsr-missing-rtf-{year}")
    year_filter = f"adjudication_date >= '{year}-01-01' AND adjudication_date < '{year + 1}-01-01'"

    print(f"\n{'='*60}")
    print(f"  YEAR {year}")
    print(f"{'='*60}\n")

    rtf_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Get missing doc_ids with URLs
    print(f"  [{year}] Querying missing doc_ids...", flush=True)
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

    print(f"  [{year}] Missing: {len(items):,}", flush=True)
    if not items:
        print(f"  [{year}] Nothing to do!")
        return

    # Step 2: Filter already on disk
    to_download = []
    for doc_id, url in items:
        p = rtf_dir / f"{doc_id}.rtf"
        if not p.exists() or p.stat().st_size == 0:
            to_download.append((doc_id, url))
    on_disk = len(items) - len(to_download)
    if on_disk:
        print(f"  [{year}] Already on disk: {on_disk:,}")
    print(f"  [{year}] Downloading {len(to_download):,} RTFs ({args.workers} concurrent)...", flush=True)

    # Step 3: Download
    if to_download:
        dl_start = time.time()
        stats = asyncio.run(download_all(to_download, rtf_dir, args.workers))
        elapsed = time.time() - dl_start
        rate = stats.downloaded / elapsed if elapsed > 0 else 0
        print(f"  [{year}] Download: {stats.downloaded:,} ok, {stats.failed:,} failed "
              f"in {elapsed/60:.1f}m ({rate:.0f}/s)", flush=True)

    # Step 4: Import
    print(f"  [{year}] Importing ({args.import_workers} workers)...", flush=True)
    all_doc_ids = []
    for entry in os.scandir(rtf_dir):
        if entry.name.endswith('.rtf'):
            try:
                all_doc_ids.append(int(entry.name[:-4]))
            except ValueError:
                pass

    if not all_doc_ids:
        print(f"  [{year}] No RTF files!")
        return

    to_import_files = [f"{rtf_dir}/{did}.rtf" for did in sorted(all_doc_ids)]
    del all_doc_ids
    gc.collect()

    total_imported = 0
    total_batches = (len(to_import_files) + args.batch - 1) // args.batch
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
                total_imported += psql_copy_upsert(buf.getvalue())

            if (batch_idx + 1) % 20 == 0 or batch_idx == total_batches - 1:
                elapsed = time.time() - start
                rate = total_imported / elapsed if elapsed > 0 else 0
                done_f = min(batch_start + len(batch_files), len(to_import_files))
                pct = 100.0 * done_f / len(to_import_files)
                print(f"  [{year}] {batch_idx+1}/{total_batches} ({pct:.1f}%) | "
                      f"{total_imported:,} imported | {rate:.0f}/s", flush=True)

    elapsed = time.time() - start
    rate = total_imported / elapsed if elapsed > 0 else 0
    print(f"  [{year}] Done: {total_imported:,} in {elapsed/60:.1f}m ({rate:.0f}/s)", flush=True)

    # Cleanup RTF dir
    for f in rtf_dir.glob("*.rtf"):
        f.unlink()
    try:
        rtf_dir.rmdir()
    except OSError:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--workers', type=int, default=200)
    parser.add_argument('--import-workers', type=int, default=12)
    parser.add_argument('--batch', type=int, default=5000)
    args = parser.parse_args()

    print(f"=== ЄДРСР Missing Fulltext Download & Import ===")
    print(f"Year: {args.year}, Download: {args.workers} workers, Import: {args.import_workers} workers")

    global_start = time.time()
    process_year(args.year, args)
    elapsed = time.time() - global_start
    print(f"\n=== Year {args.year} complete in {elapsed/60:.1f}m ===")


if __name__ == '__main__':
    main()
