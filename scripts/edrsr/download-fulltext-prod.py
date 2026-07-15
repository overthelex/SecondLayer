#!/usr/bin/env python3
"""
Download ЄДРСР full texts (RTF) on PROD using the secondary-IP egress pool.
Each source IP is a prod ENI secondary private IP with its own EIP, so N IPs ×
THREADS_PER_IP gives N× the per-IP concurrency against od.reyestr.court.gov.ua.

Downloads only docs that have metadata (doc_url) but no row in edrsr_fulltext.
Resumable: RTFs already on disk and doc_ids already in the DB are skipped.

Usage:
    python3 download-fulltext-prod.py --from 2026-06-01 --to 2026-08-01
    python3 download-fulltext-prod.py --from 2026-06-01 --to 2026-08-01 --skip-download
    python3 download-fulltext-prod.py --from 2026-06-01 --to 2026-08-01 --threads 3
"""

import argparse
import asyncio
import aiofiles
import csv
import io
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from collections import defaultdict

# ── Config ──
# Prod ENI secondary private IPs, each with its own EIP. Verified 2026-07-15:
# every one egresses via a distinct public IP and gets HTTP 200 from reyestr.
# The primary IP (172.31.29.20 → 18.192.189.254) is deliberately excluded — it
# carries prod's own traffic (TURN/STUN, outbound API) and must not risk a
# reyestr-side throttle.
SOURCE_IPS = [
    "172.31.21.47",     # 52.57.240.221
    "172.31.22.206",    # 3.74.236.42
    "172.31.27.31",     # 35.157.236.160
    "172.31.28.109",    # 63.177.198.82
    "172.31.31.40",     # 18.198.163.194
    "172.31.21.255",    # 3.122.149.159
    "172.31.19.142",    # 3.125.14.33
    "172.31.19.20",     # 3.65.44.169
    "172.31.17.145",    # 63.185.68.100
    "172.31.16.240",    # 3.64.220.201
    "172.31.21.126",    # 63.184.96.255
    "172.31.21.214",    # 18.185.195.46
    "172.31.27.133",    # 3.74.66.255
    "172.31.22.179",    # 3.68.255.49
]
THREADS_PER_IP = 5

RTF_DIR = Path("/home/ubuntu/edrsr-rtf")  # overridden by --rtf-dir
CONTAINER = "secondlayer-postgres-prod"
PGUSER = "secondlayer"
PGDB = "secondlayer_prod"


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
    text = re.sub(r'\\u(\d+)\??', decode_unicode, text)
    text = re.sub(r'\\[a-zA-Z]+-?\d*\s?', '', text)
    text = text.replace('{', '').replace('}', '')
    text = text.replace('\x00', '')
    text = text.replace('\r\n', '\n')
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return text if text else None


# ── DB helpers ──
def psql(sql: str, tuples=False) -> str:
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql error: {r.stderr}")
    if tuples:
        return [line for line in r.stdout.strip().split('\n') if line]
    return r.stdout.strip()


def psql_copy_rows(rows, date_from: str, date_to: str):
    """COPY (doc_id, full_text) into a staging table, then insert with every column
    the readers depend on.

    edrsr_fulltext is LIST-partitioned on adj_year and its GIN index is on tsv, so a
    bare COPY of (doc_id, full_text) fails outright ("no partition ... adj_year = null")
    and, were the row to land, would be invisible to FTS. adj_year/justice_kind come
    from edrsr_documents; the date predicate on the join lets PG prune to the relevant
    document partitions instead of probing all of them by doc_id.

    Uses COPY text format with explicit escaping rather than CSV: decision texts are
    multi-line, and quoted CSV fields spanning newlines are misread as unquoted
    newlines when the COPY block is fed inline through a psql script.
    """
    lines = []
    for doc_id, text in rows:
        esc = (text.replace('\\', '\\\\')
                   .replace('\t', '\\t')
                   .replace('\n', '\\n')
                   .replace('\r', ''))
        lines.append(f"{doc_id}\t{esc}")
    if not lines:
        return False
    copy_block = '\n'.join(lines)

    sql = f"""
CREATE TEMP TABLE _ft_stage (doc_id bigint, full_text text);
COPY _ft_stage (doc_id, full_text) FROM STDIN;
{copy_block}
\\.
INSERT INTO edrsr_fulltext (doc_id, full_text, text_length, tsv, adj_year, justice_kind)
SELECT s.doc_id,
       s.full_text,
       length(s.full_text),
       to_tsvector('simple', s.full_text),
       extract(year FROM d.adjudication_date)::smallint,
       d.justice_kind
FROM _ft_stage s
JOIN edrsr_documents d
  ON d.doc_id = s.doc_id
 AND d.adjudication_date >= '{date_from}'
 AND d.adjudication_date < '{date_to}'
ON CONFLICT DO NOTHING;
DROP TABLE _ft_stage;
"""
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER,
           "-d", PGDB, "-v", "ON_ERROR_STOP=1", "-q"]
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  COPY error: {r.stderr[:300]}", file=sys.stderr, flush=True)
        return False
    return True


# ── Download stats ──
class DownloadStats:
    def __init__(self, total: int):
        self.total = total
        self.downloaded = 0
        self.failed = 0
        self.skipped = 0
        self.start = time.time()
        self.lock = asyncio.Lock()
        self.per_ip = defaultdict(int)

    async def inc(self, field: str, ip: str = None):
        async with self.lock:
            setattr(self, field, getattr(self, field) + 1)
            if ip and field == 'downloaded':
                self.per_ip[ip] += 1

    def report(self) -> str:
        elapsed = time.time() - self.start
        done = self.downloaded + self.failed + self.skipped
        rate = self.downloaded / elapsed if elapsed > 0 else 0
        remaining = self.total - done
        eta = remaining / rate if rate > 0 else 0
        ip_stats = " | ".join(f"{ip.split('.')[-1]}={cnt}" for ip, cnt in sorted(self.per_ip.items()))
        return (
            f"[{done}/{self.total}] "
            f"ok={self.downloaded} fail={self.failed} skip={self.skipped} | "
            f"{rate:.0f}/s | ETA {eta/60:.0f}m | IPs: {ip_stats}"
        )


async def download_one(session, doc_id, url, stats, semaphore, source_ip):
    import aiohttp

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
                            await stats.inc('downloaded', source_ip)
                            return
                    elif resp.status == 429:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    elif resp.status >= 500:
                        await asyncio.sleep(2 * (attempt + 1))
                        continue
            except Exception:
                pass
            await asyncio.sleep(2 * (attempt + 1))

        await stats.inc('failed')


BATCH_SIZE = 50000  # Process in batches to avoid OOM on 8M+ items


async def download_batch(batch_items, stats, threads_per_ip):
    """Download one batch of items across all IPs."""
    import aiohttp

    ip_items = defaultdict(list)
    for i, item in enumerate(batch_items):
        ip = SOURCE_IPS[i % len(SOURCE_IPS)]
        ip_items[ip].append(item)

    async def ip_worker(source_ip, ip_docs):
        semaphore = asyncio.Semaphore(threads_per_ip)
        connector = aiohttp.TCPConnector(
            limit=threads_per_ip,
            limit_per_host=threads_per_ip,
            local_addr=(source_ip, 0),
        )
        async with aiohttp.ClientSession(connector=connector) as session:
            tasks = [
                download_one(session, doc_id, url, stats, semaphore, source_ip)
                for doc_id, url in ip_docs
            ]
            await asyncio.gather(*tasks)

    await asyncio.gather(*[ip_worker(ip, docs) for ip, docs in ip_items.items()])


async def download_all(items, threads_per_ip):
    stats = DownloadStats(len(items))
    total_batches = (len(items) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"  Total: {len(items)}, batch size: {BATCH_SIZE}, batches: {total_batches}", flush=True)

    async def progress():
        while True:
            await asyncio.sleep(15)
            print(f"  {stats.report()}", flush=True)

    prog_task = asyncio.create_task(progress())

    for batch_idx in range(total_batches):
        start = batch_idx * BATCH_SIZE
        batch = items[start:start + BATCH_SIZE]
        print(f"\n  --- Batch {batch_idx + 1}/{total_batches} ({len(batch)} items) ---", flush=True)
        await download_batch(batch, stats, threads_per_ip)

    prog_task.cancel()
    print(f"\n  Download complete: {stats.report()}", flush=True)
    return stats


# ── Import to DB ──
def import_to_db(date_from, date_to, batch_size=2000):
    print("[3/4] Importing RTFs to edrsr_fulltext...", flush=True)

    downloaded = set()
    for f in RTF_DIR.iterdir():
        if f.suffix == '.rtf' and f.stat().st_size > 0:
            try:
                downloaded.add(int(f.stem))
            except ValueError:
                pass
    print(f"  RTF files on disk: {len(downloaded)}", flush=True)

    min_doc = min(downloaded) if downloaded else 0
    existing_raw = psql(
        f"SELECT doc_id FROM edrsr_fulltext WHERE doc_id >= {min_doc};",
        tuples=True
    )
    existing = {int(x) for x in existing_raw}
    print(f"  Already in DB: {len(existing)}", flush=True)

    to_import = sorted(downloaded - existing)
    print(f"  To import: {len(to_import)}", flush=True)

    if not to_import:
        return

    total_imported = 0
    total_batches = (len(to_import) + batch_size - 1) // batch_size
    start = time.time()

    for batch_idx in range(total_batches):
        batch_start = batch_idx * batch_size
        batch_ids = to_import[batch_start: batch_start + batch_size]

        rows = []
        for doc_id in batch_ids:
            filepath = RTF_DIR / f"{doc_id}.rtf"
            text = rtf_to_text(filepath)
            if text:
                rows.append((doc_id, text))

        if rows:
            if psql_copy_rows(rows, date_from, date_to):
                total_imported += len(rows)

        if (batch_idx + 1) % 10 == 0 or batch_idx == total_batches - 1:
            elapsed = time.time() - start
            rate = total_imported / elapsed if elapsed > 0 else 0
            print(f"  Batch {batch_idx + 1}/{total_batches}: {total_imported} imported, {rate:.0f}/s", flush=True)

    print(f"  Import complete: {total_imported} records", flush=True)


def verify(date_from, date_to):
    print("\n[4/4] Verification...", flush=True)
    r = psql("""
        SELECT count(*) AS total,
               pg_size_pretty(pg_total_relation_size('edrsr_fulltext')) AS size
        FROM edrsr_fulltext;
    """)
    print(f"  edrsr_fulltext: {r}", flush=True)

    lines = psql(f"""
        SELECT to_char(d.adjudication_date, 'YYYY-MM') AS month,
               count(d.doc_id) AS total_docs,
               count(ft.doc_id) AS with_fulltext,
               round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 1) AS pct
        FROM edrsr_documents d
        LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
        WHERE d.adjudication_date >= '{date_from}'
          AND d.adjudication_date < '{date_to}'
        GROUP BY 1 ORDER BY 1;
    """, tuples=True)
    print("  month | total_docs | with_fulltext | %", flush=True)
    for line in lines:
        print(f"  {line}", flush=True)


def main():
    global RTF_DIR

    parser = argparse.ArgumentParser(description="ЄДРСР fulltext — PROD multi-IP downloader")
    parser.add_argument('--from', dest='date_from', required=True,
                        help='adjudication_date >= this (YYYY-MM-DD)')
    parser.add_argument('--to', dest='date_to', required=True,
                        help='adjudication_date < this (YYYY-MM-DD, exclusive)')
    parser.add_argument('--rtf-dir', default=None,
                        help='RTF scratch dir (default /home/ubuntu/edrsr-rtf-<from>_<to>)')
    parser.add_argument('--skip-download', action='store_true', help='Skip RTF download, only import to DB')
    parser.add_argument('--threads', type=int, default=THREADS_PER_IP, help='Threads per IP (default 5)')
    parser.add_argument('--batch', type=int, default=2000, help='DB import batch size')
    args = parser.parse_args()

    for d in (args.date_from, args.date_to):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d):
            parser.error(f"date must be YYYY-MM-DD, got: {d}")
    if args.date_from >= args.date_to:
        parser.error(f"--from ({args.date_from}) must be before --to ({args.date_to})")

    RTF_DIR = Path(args.rtf_dir) if args.rtf_dir else \
        Path(f"/home/ubuntu/edrsr-rtf-{args.date_from}_{args.date_to}")

    threads_per_ip = args.threads
    total_workers = len(SOURCE_IPS) * threads_per_ip

    RTF_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60, flush=True)
    print(f"  ЄДРСР Fulltext — PROD multi-IP download", flush=True)
    print(f"  Range: {args.date_from} .. {args.date_to} (adjudication_date)", flush=True)
    print(f"  IPs: {len(SOURCE_IPS)} × {threads_per_ip} threads = {total_workers} workers", flush=True)
    print(f"  RTF dir: {RTF_DIR}", flush=True)
    print("=" * 60, flush=True)

    if not args.skip_download:
        print(f"\n[1/4] Querying doc URLs from DB...", flush=True)
        raw = psql(f"""
            SELECT d.doc_id || '|' || d.doc_url
            FROM edrsr_documents d
            LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
            WHERE d.adjudication_date >= '{args.date_from}'
              AND d.adjudication_date < '{args.date_to}'
              AND d.doc_url IS NOT NULL AND length(d.doc_url) > 0
              AND ft.doc_id IS NULL
            ORDER BY d.doc_id;
        """, tuples=True)

        items = []
        for line in raw:
            parts = line.split('|', 1)
            if len(parts) == 2:
                items.append((int(parts[0]), parts[1]))

        print(f"  Total URLs: {len(items)}", flush=True)

        # Filter already on disk
        before = len(items)
        items = [(doc_id, url) for doc_id, url in items
                 if not (RTF_DIR / f"{doc_id}.rtf").exists()]
        print(f"  Already on disk: {before - len(items)}", flush=True)
        print(f"  To download: {len(items)}", flush=True)

        if items:
            print(f"\n[2/4] Downloading {len(items)} RTFs ({len(SOURCE_IPS)} IPs × {threads_per_ip} threads)...", flush=True)
            asyncio.run(download_all(items, threads_per_ip))
        else:
            print("[2/4] All files already downloaded", flush=True)
    else:
        print("[1-2/4] Skipped download", flush=True)

    import_to_db(args.date_from, args.date_to, args.batch)
    verify(args.date_from, args.date_to)
    print("\n=== Done! ===", flush=True)


if __name__ == '__main__':
    main()
