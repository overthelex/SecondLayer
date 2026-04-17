#!/usr/bin/env python3
"""
Backfill missing EDRSR fulltext on PROD for any year, using multi-IP parallel
downloads. Runs ON prod (not over SSH). Supports IP subsets so multiple
instances can run concurrently for different years without oversubscribing.

Usage on prod:
    python3 download-fulltext-gap-prod.py --year 2008 --ip-subset 0,1 --threads 10
    python3 download-fulltext-gap-prod.py --year 2019 --ip-subset 2,3 --threads 10
    python3 download-fulltext-gap-prod.py --year 2018 --ip-subset 4 --threads 15
    python3 download-fulltext-gap-prod.py --year 2008 --skip-download
"""

import argparse
import asyncio
import csv
import io
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

import aiofiles
import aiohttp

ALL_SOURCE_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
]

RTF_DIR_BASE = Path("/home/ubuntu/edrsr-rtf-gaps")
CONTAINER = "secondlayer-postgres-prod"
PGUSER = "secondlayer"
PGDB = "secondlayer_prod"
REQUEST_TIMEOUT = 30
MAX_RETRIES = 4
BATCH_SIZE = 50_000


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


def html_to_text(raw: bytes) -> str | None:
    for enc in ['windows-1251', 'utf-8', 'latin1']:
        try:
            html = raw.decode(enc)
            if re.search(r'[а-яіїєґА-ЯІЇЄҐ]', html):
                break
        except Exception:
            continue
    else:
        html = raw.decode('windows-1251', errors='replace')
    text = re.sub(r'<head[^>]*>.*?</head>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?p[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?div[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?tr[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?td[^>]*>', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    return text if len(text) >= 100 else None


def rtf_to_text(filepath: Path) -> str | None:
    try:
        raw = filepath.read_bytes()
        if len(raw) > 50_000_000:
            return None
    except (IOError, OSError):
        return None
    head = raw[:32].lstrip().lower()
    if head.startswith(b'<html') or head.startswith(b'<!doctype html') or head.startswith(b'<?xml'):
        return html_to_text(raw)
    text = raw.decode('latin1')
    if not text.startswith('{\\rtf'):
        return None
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
    return text if len(text) >= 100 else None


def psql(sql: str, tuples=False):
    cmd = ["docker", "exec", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-Atc", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql error: {r.stderr}")
    if tuples:
        return [line for line in r.stdout.strip().split('\n') if line]
    return r.stdout.strip()


def psql_copy(csv_data: str) -> bool:
    cmd = [
        "docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-c",
        "COPY edrsr_fulltext(doc_id, adj_year, justice_kind, full_text) FROM STDIN WITH (FORMAT csv);"
    ]
    r = subprocess.run(cmd, input=csv_data, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  COPY error: {r.stderr[:300]}", file=sys.stderr, flush=True)
        return False
    return True


class Stats:
    def __init__(self, total: int):
        self.total = total
        self.downloaded = 0
        self.failed = 0
        self.skipped = 0
        self.start = time.time()
        self.lock = asyncio.Lock()
        self.per_ip = defaultdict(int)

    async def inc(self, field: str, ip: str | None = None):
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
        ip_stats = " ".join(f"{ip.split('.')[-1]}={cnt}" for ip, cnt in sorted(self.per_ip.items()))
        return (
            f"[{done}/{self.total}] ok={self.downloaded} fail={self.failed} skip={self.skipped} "
            f"| {rate:.0f}/s | ETA {eta/60:.0f}m | {ip_stats}"
        )


async def download_one(session, doc_id, url, rtf_dir, stats, semaphore, source_ip):
    outpath = rtf_dir / f"{doc_id}.rtf"
    if outpath.exists() and outpath.stat().st_size > 0:
        await stats.inc('skipped')
        return
    async with semaphore:
        for attempt in range(MAX_RETRIES):
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)) as resp:
                    if resp.status == 200:
                        data = await resp.read()
                        if len(data) > 100:
                            async with aiofiles.open(outpath, 'wb') as f:
                                await f.write(data)
                            await stats.inc('downloaded', source_ip)
                            return
                        await stats.inc('failed')
                        return
                    elif resp.status == 429:
                        await asyncio.sleep(min(60, 5 * (2 ** attempt)))
                        continue
                    elif resp.status >= 500:
                        await asyncio.sleep(min(30, 2 * (2 ** attempt)))
                        continue
                    else:
                        await stats.inc('failed')
                        return
            except Exception:
                await asyncio.sleep(min(15, 2 * (2 ** attempt)))
        await stats.inc('failed')


async def download_batch(batch_items, stats, source_ips, threads_per_ip):
    ip_items = defaultdict(list)
    for i, item in enumerate(batch_items):
        ip = source_ips[i % len(source_ips)]
        ip_items[ip].append(item)

    async def ip_worker(source_ip, docs):
        semaphore = asyncio.Semaphore(threads_per_ip)
        connector = aiohttp.TCPConnector(
            limit=threads_per_ip,
            limit_per_host=threads_per_ip,
            local_addr=(source_ip, 0),
        )
        async with aiohttp.ClientSession(connector=connector) as session:
            tasks = [download_one(session, d, u, RTF_DIR, stats, semaphore, source_ip)
                     for d, u in docs]
            await asyncio.gather(*tasks)

    await asyncio.gather(*[ip_worker(ip, docs) for ip, docs in ip_items.items()])


async def download_all(items, source_ips, threads_per_ip):
    stats = Stats(len(items))
    total_batches = (len(items) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"  Total: {len(items)}, batch size: {BATCH_SIZE}, batches: {total_batches}", flush=True)

    async def progress():
        while True:
            await asyncio.sleep(30)
            print(f"  {stats.report()}", flush=True)

    prog_task = asyncio.create_task(progress())
    try:
        for batch_idx in range(total_batches):
            start = batch_idx * BATCH_SIZE
            batch = items[start:start + BATCH_SIZE]
            print(f"\n  --- Batch {batch_idx + 1}/{total_batches} ({len(batch)}) ---", flush=True)
            await download_batch(batch, stats, source_ips, threads_per_ip)
    finally:
        prog_task.cancel()
    print(f"\n  Download complete: {stats.report()}", flush=True)
    return stats


def import_to_db(rtf_dir: Path, year: int, batch_size: int = 1000):
    print(f"\n[IMPORT] RTFs → edrsr_fulltext (year={year})", flush=True)

    downloaded = set()
    for f in rtf_dir.iterdir():
        if f.suffix == '.rtf' and f.stat().st_size > 0:
            try:
                downloaded.add(int(f.stem))
            except ValueError:
                pass
    print(f"  RTF files on disk: {len(downloaded)}", flush=True)
    if not downloaded:
        return

    # Use partition pruning: edrsr_fulltext is partitioned by adj_year
    existing_raw = psql(
        f"SELECT doc_id FROM edrsr_fulltext WHERE adj_year = {year};",
        tuples=True,
    )
    existing = {int(x) for x in existing_raw}
    print(f"  Already in DB: {len(existing)}", flush=True)

    to_import_ids = sorted(downloaded - existing)
    print(f"  To import: {len(to_import_ids)}", flush=True)
    if not to_import_ids:
        return

    # Fetch justice_kind for all docs of this year in one partition-pruned scan.
    # edrsr_documents is partitioned by adjudication_date year.
    jk_raw = psql(
        f"SELECT doc_id || '|' || COALESCE(justice_kind::text, '') "
        f"FROM edrsr_documents "
        f"WHERE adjudication_date >= '{year}-01-01' AND adjudication_date < '{year + 1}-01-01';",
        tuples=True,
    )
    jk_map = {}
    for line in jk_raw:
        parts = line.split('|', 1)
        if len(parts) == 2:
            jk_map[int(parts[0])] = int(parts[1]) if parts[1] else None
    print(f"  justice_kind map: {len(jk_map)} docs", flush=True)

    total_imported = 0
    total_batches = (len(to_import_ids) + batch_size - 1) // batch_size
    start = time.time()

    for batch_idx in range(total_batches):
        batch_start = batch_idx * batch_size
        ids = to_import_ids[batch_start:batch_start + batch_size]
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_ALL, escapechar='\\', doublequote=True)
        converted = 0
        for doc_id in ids:
            text = rtf_to_text(rtf_dir / f"{doc_id}.rtf")
            if text:
                # Strip characters that break PG COPY CSV even with QUOTE_ALL
                text = text.replace('\x00', '').replace('\r', '')
                jk = jk_map.get(doc_id)
                writer.writerow([doc_id, year, jk if jk is not None else '', text])
                converted += 1
        if converted > 0 and psql_copy(buf.getvalue()):
            total_imported += converted
        if (batch_idx + 1) % 20 == 0 or batch_idx == total_batches - 1:
            elapsed = time.time() - start
            rate = total_imported / elapsed if elapsed > 0 else 0
            print(f"  Batch {batch_idx + 1}/{total_batches}: {total_imported} imported, {rate:.0f}/s", flush=True)

    print(f"  Import done: {total_imported} records", flush=True)


def verify(year: int):
    print(f"\n[VERIFY] year {year}", flush=True)
    r = psql(f"""
        SELECT count(d.doc_id), count(ft.doc_id),
               round(100.0 * count(ft.doc_id) / NULLIF(count(d.doc_id),0), 2)
        FROM edrsr_documents d
        LEFT JOIN edrsr_fulltext ft ON d.doc_id = ft.doc_id
        WHERE d.adjudication_date >= '{year}-01-01' AND d.adjudication_date < '{year + 1}-01-01';
    """)
    print(f"  total | with_ft | % → {r}", flush=True)


def main():
    global RTF_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--ip-subset', type=str, default="0,1,2,3,4",
                    help="Indices into SOURCE_IPS (e.g. '0,1' uses first two)")
    ap.add_argument('--threads', type=int, default=10, help="Threads per IP")
    ap.add_argument('--justice-kind', type=int, help="Filter justice_kind (optional)")
    ap.add_argument('--skip-download', action='store_true')
    ap.add_argument('--skip-import', action='store_true')
    ap.add_argument('--batch', type=int, default=1000)
    ap.add_argument('--rtf-dir', type=Path, default=None)
    args = ap.parse_args()

    indices = [int(x) for x in args.ip_subset.split(',') if x.strip()]
    source_ips = [ALL_SOURCE_IPS[i] for i in indices]

    RTF_DIR = args.rtf_dir or (RTF_DIR_BASE / f"rtf{args.year}")
    RTF_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60, flush=True)
    print(f"  EDRSR fulltext gap backfill — year {args.year}", flush=True)
    print(f"  IPs ({len(source_ips)}): {', '.join(source_ips)}", flush=True)
    print(f"  Threads per IP: {args.threads} → total workers: {len(source_ips) * args.threads}", flush=True)
    print(f"  RTF dir: {RTF_DIR}", flush=True)
    if args.justice_kind is not None:
        print(f"  justice_kind filter: {args.justice_kind}", flush=True)
    print("=" * 60, flush=True)

    if not args.skip_download:
        print(f"\n[QUERY] missing docs with URLs...", flush=True)
        jk_clause = f"AND d.justice_kind = {args.justice_kind}" if args.justice_kind is not None else ""
        sql = f"""
            SELECT d.doc_id || '|' || d.doc_url
            FROM edrsr_documents d
            LEFT JOIN edrsr_fulltext ft ON ft.doc_id = d.doc_id
            WHERE d.adjudication_date >= '{args.year}-01-01'
              AND d.adjudication_date <  '{args.year + 1}-01-01'
              AND d.doc_url IS NOT NULL AND length(d.doc_url) > 0
              AND ft.doc_id IS NULL
              {jk_clause}
            ORDER BY d.doc_id
        """
        raw = psql(sql, tuples=True)
        items = []
        for line in raw:
            parts = line.split('|', 1)
            if len(parts) == 2:
                items.append((int(parts[0]), parts[1]))
        print(f"  Missing with URL: {len(items)}", flush=True)

        before = len(items)
        items = [(d, u) for d, u in items if not (RTF_DIR / f"{d}.rtf").exists()]
        print(f"  Already on disk: {before - len(items)}", flush=True)
        print(f"  To download: {len(items)}", flush=True)

        if items:
            asyncio.run(download_all(items, source_ips, args.threads))

    if not args.skip_import:
        import_to_db(RTF_DIR, args.year, args.batch)

    verify(args.year)
    print("\n=== Done ===", flush=True)


if __name__ == '__main__':
    main()
