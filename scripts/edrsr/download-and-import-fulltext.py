#!/usr/bin/env python3
"""
Download RTF full texts from reyestr.court.gov.ua and import into edrsr_fulltext.

Usage: python3 download-and-import-fulltext.py [--workers 100] [--batch 2000]
"""
import asyncio
import aiohttp
import aiofiles
import csv
import io
import os
import re
import subprocess
import sys
import time
import argparse
from pathlib import Path
from collections import defaultdict

# ── Config ──
RTF_DIR = Path("/tmp/edrsr-rtf-2025-2026")
CONTAINER = "secondlayer-postgres-local"
PGUSER = "secondlayer"
PGDB = "secondlayer_local"

# ── RTF → plaintext converter ──
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

def rtf_to_text(filepath: Path) -> str | None:
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
    return text if text else None


def psql(sql: str, tuples=False) -> str:
    """Run psql in docker container."""
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql error: {r.stderr}")
    if tuples:
        return [line for line in r.stdout.strip().split('\n') if line]
    return r.stdout.strip()


def psql_copy_csv(csv_data: str):
    """COPY CSV data into edrsr_fulltext via stdin."""
    cmd = [
        "docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-c",
        "COPY edrsr_fulltext(doc_id, full_text) FROM STDIN WITH (FORMAT csv);"
    ]
    r = subprocess.run(cmd, input=csv_data, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  COPY error: {r.stderr[:200]}", file=sys.stderr)
        return False
    return True


# ── Download ──
class Stats:
    def __init__(self, total: int):
        self.total = total
        self.downloaded = 0
        self.failed = 0
        self.skipped = 0
        self.start = time.time()
        self.lock = asyncio.Lock()

    async def inc(self, field: str):
        async with self.lock:
            setattr(self, field, getattr(self, field) + 1)

    def report(self) -> str:
        elapsed = time.time() - self.start
        done = self.downloaded + self.failed + self.skipped
        rate = self.downloaded / elapsed if elapsed > 0 else 0
        remaining = self.total - done
        eta = remaining / rate if rate > 0 else 0
        return (
            f"  [{done}/{self.total}] "
            f"ok={self.downloaded} fail={self.failed} skip={self.skipped} | "
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
                            async with aiofiles.open(outpath, 'wb') as f:
                                await f.write(data)
                            await stats.inc('downloaded')
                            return
                    elif resp.status == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
            except Exception:
                pass
            await asyncio.sleep(2 * (attempt + 1))

        await stats.inc('failed')


async def download_all(items: list[tuple[int, str]], workers: int):
    """Download all RTFs with async concurrency."""
    stats = Stats(len(items))
    semaphore = asyncio.Semaphore(workers)

    connector = aiohttp.TCPConnector(limit=workers, limit_per_host=workers)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [download_one(session, doc_id, url, stats, semaphore) for doc_id, url in items]

        # Progress reporter
        async def progress():
            while True:
                await asyncio.sleep(10)
                print(f"\r{stats.report()}", flush=True)

        prog_task = asyncio.create_task(progress())

        await asyncio.gather(*tasks)
        prog_task.cancel()

    print(f"\n  Download done: {stats.report()}")
    return stats


# ── Import ──
def import_to_db(batch_size: int):
    """Convert downloaded RTFs to text and batch import into PG."""
    print("[4/5] Building import list...")

    # Get all downloaded doc_ids from filesystem
    downloaded = set()
    for f in RTF_DIR.iterdir():
        if f.suffix == '.rtf' and f.stat().st_size > 0:
            try:
                downloaded.add(int(f.stem))
            except ValueError:
                pass

    print(f"  RTF files on disk: {len(downloaded)}")

    # Get already imported
    existing_raw = psql(
        "SELECT doc_id FROM edrsr_fulltext WHERE doc_id >= 133000000;",
        tuples=True
    )
    existing = {int(x) for x in existing_raw}
    print(f"  Already in DB: {len(existing)}")

    to_import = sorted(downloaded - existing)
    print(f"  To import: {len(to_import)}")

    if not to_import:
        return

    # Process in batches
    total_imported = 0
    total_batches = (len(to_import) + batch_size - 1) // batch_size
    start = time.time()

    for batch_idx in range(total_batches):
        batch_start = batch_idx * batch_size
        batch_ids = to_import[batch_start : batch_start + batch_size]

        # Convert RTF → CSV in memory
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
        converted = 0

        for doc_id in batch_ids:
            filepath = RTF_DIR / f"{doc_id}.rtf"
            text = rtf_to_text(filepath)
            if text:
                writer.writerow([doc_id, text])
                converted += 1

        if converted > 0:
            csv_data = buf.getvalue()
            if psql_copy_csv(csv_data):
                total_imported += converted

        if (batch_idx + 1) % 10 == 0 or batch_idx == total_batches - 1:
            elapsed = time.time() - start
            rate = total_imported / elapsed if elapsed > 0 else 0
            print(f"  Batch {batch_idx+1}/{total_batches}: {total_imported} imported, {rate:.0f}/s")

    print(f"  Import complete: {total_imported} records")


def verify():
    print("\n[5/5] Verification...")
    r1 = psql("""
        SELECT count(*) AS total,
               count(CASE WHEN doc_id >= 133000000 THEN 1 END) AS new_2025_2026,
               pg_size_pretty(pg_total_relation_size('edrsr_fulltext')) AS size
        FROM edrsr_fulltext;
    """)
    print(f"  edrsr_fulltext: {r1}")

    lines = psql("""
        SELECT extract(year from d.adjudication_date)::int AS year,
               count(d.doc_id) AS total_docs,
               count(ft.doc_id) AS with_fulltext,
               round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 1) AS pct
        FROM edrsr_documents d
        LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
        WHERE d.adjudication_date >= '2025-01-01'
          AND extract(year from d.adjudication_date) <= 2026
        GROUP BY 1 ORDER BY 1;
    """, tuples=True)
    print("  year | total_docs | with_fulltext | %")
    for line in lines:
        print(f"  {line}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=100, help='Parallel downloads')
    parser.add_argument('--batch', type=int, default=2000, help='DB import batch size')
    parser.add_argument('--skip-download', action='store_true', help='Skip download, only import')
    args = parser.parse_args()

    RTF_DIR.mkdir(parents=True, exist_ok=True)

    print("=== ЄДРСР Fulltext Download & Import ===")
    print(f"Workers: {args.workers}, Batch: {args.batch}")
    print(f"RTF dir: {RTF_DIR}")
    print()

    if not args.skip_download:
        # Step 1: Get URLs
        print("[1/5] Querying doc_id + doc_url from PG...")
        raw = psql("""
            SELECT d.doc_id || '|' || d.doc_url
            FROM edrsr_documents d
            LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
            WHERE d.adjudication_date >= '2025-01-01'
              AND d.doc_url IS NOT NULL AND d.doc_url != ''
              AND ft.doc_id IS NULL
            ORDER BY d.doc_id;
        """, tuples=True)

        items = []
        for line in raw:
            parts = line.split('|', 1)
            if len(parts) == 2:
                items.append((int(parts[0]), parts[1]))

        print(f"  URLs to process: {len(items)}")

        if not items:
            print("Nothing to download!")
            return

        # Step 2: Filter already on disk
        print("[2/5] Filtering already downloaded...")
        before = len(items)
        items = [(doc_id, url) for doc_id, url in items
                 if not (RTF_DIR / f"{doc_id}.rtf").exists()]
        skipped = before - len(items)
        print(f"  Already on disk: {skipped}")
        print(f"  To download: {len(items)}")

        # Step 3: Download
        if items:
            print(f"[3/5] Downloading {len(items)} RTFs ({args.workers} concurrent)...")
            asyncio.run(download_all(items, args.workers))
        else:
            print("[3/5] All files already downloaded")
    else:
        print("[1-3/5] Skipped (--skip-download)")

    # Step 4: Import
    import_to_db(args.batch)

    # Step 5: Verify
    verify()

    print("\n=== Done! ===")


if __name__ == '__main__':
    main()
