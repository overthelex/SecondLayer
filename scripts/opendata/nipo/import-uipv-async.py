#!/usr/bin/env python3
"""
Async multi-IP parallel import from sis.nipo.gov.ua into PostgreSQL.
Uses asyncio + aiohttp with per-IP rate limiting via semaphores.

4 IPs × 5 concurrent = 20 parallel requests, rate-limited to 1 req/s per IP.

Usage:
    python3 import-uipv-async.py trademarks
    python3 import-uipv-async.py all
    python3 import-uipv-async.py trademarks --from-page 36899
    THREADS_PER_IP=5 python3 import-uipv-async.py all
"""

import argparse
import asyncio
import json
import os
import sys
import time
import logging
import ssl

import aiohttp
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_HOST = "sis.nipo.gov.ua"
API_BASE = f"https://{API_HOST}/api/v1/open-data/"

SOURCE_IPS = os.environ.get("SOURCE_IPS", "").split(",") if os.environ.get("SOURCE_IPS") else [
    "46.118.227.107", "178.150.37.129", "178.150.37.162", "178.150.37.146",
]
SOURCE_IPS = [ip.strip() for ip in SOURCE_IPS if ip.strip()]

THREADS_PER_IP = int(os.environ.get("THREADS_PER_IP", "5"))
RATE_LIMIT = float(os.environ.get("RATE_LIMIT_SEC", "1.1"))  # per IP
MAX_RETRIES = 5
TIMEOUT = aiohttp.ClientTimeout(total=30)

OBJ_TYPES = {
    "trademarks": {"type": 4, "table": "opendata_trademarks"},
    "patents": {"type": 1, "table": "opendata_patents"},
    "utility_models": {"type": 2, "table": "opendata_patents"},
    "designs": {"type": 6, "table": "opendata_patents"},
}

# --- Stats ---
stats = {"imported": 0, "failed": 0, "requests": 0, "pages_done": 0}


def get_db_conn():
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        port=int(os.environ.get("POSTGRES_PORT", "5438")),
        user=os.environ.get("POSTGRES_USER", "secondlayer"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        dbname=os.environ.get("POSTGRES_DB", "secondlayer_prod"),
    )


def extract_trademark(record):
    data = record.get("data", {})
    mark_text = ""
    wm = (record.get("WordMarkSpecification") or {}).get("MarkSignificantVerbalElement")
    if isinstance(wm, list):
        mark_text = " ".join(w.get("#text", "") for w in wm if w.get("#text"))

    holder_name, holder_edrpou, holder_country = "", "", ""
    holders = (data.get("HolderDetails") or {}).get("Holder", [])
    if holders:
        h = (holders[0].get("HolderAddressBook") or {}).get("FormattedNameAddress", {})
        fn = (h.get("Name") or {}).get("FreeFormatName", {})
        holder_name = (fn.get("FreeFormatNameDetails") or {}).get("FreeFormatNameLine", "")
        holder_edrpou = fn.get("EDRPOU", "")
        holder_country = (h.get("Address") or {}).get("AddressCountryCode", "")

    applicant_name, applicant_edrpou = "", ""
    applicants = (data.get("ApplicantDetails") or {}).get("Applicant", [])
    if applicants:
        a = (applicants[0].get("ApplicantAddressBook") or {}).get("FormattedNameAddress", {})
        fn = (a.get("Name") or {}).get("FreeFormatName", {})
        applicant_name = (fn.get("FreeFormatNameDetails") or {}).get("FreeFormatNameLine", "")
        applicant_edrpou = fn.get("EDRPOU", "")

    class_descs = ((data.get("GoodsServicesDetails") or {}).get("GoodsServices") or {}).get("ClassDescriptionDetails", {}).get("ClassDescription", [])
    nice_classes = [c.get("ClassNumber") for c in class_descs if c.get("ClassNumber")] if class_descs else []

    return (
        record.get("app_number"),
        (record.get("app_date") or "")[:10] or None,
        record.get("registration_number"),
        (record.get("registration_date") or "")[:10] or None,
        data.get("ExpiryDate"),
        mark_text or None,
        holder_name or None, holder_edrpou or None, holder_country or None,
        applicant_name or None, applicant_edrpou or None,
        nice_classes or None, None,
        data.get("application_status") or data.get("registration_status_color"),
        record.get("last_update"),
        json.dumps(data, ensure_ascii=False),
        # Dossier (top-level record fields, siblings of `data`) — LEXAI-1835
        json.dumps(record.get("data_payments"), ensure_ascii=False) if record.get("data_payments") else None,
        json.dumps(record.get("data_docs"), ensure_ascii=False) if record.get("data_docs") else None,
    )


def extract_patent(record, obj_type):
    data = record.get("data", {})
    titles = data.get("I_54", [])
    title_ua = titles[0].get("I_54.U", "") if titles else ""
    title_en = titles[0].get("I_54.E", "") if titles else ""
    abs_list = data.get("AB", [])
    abstract_ua = ""
    if abs_list:
        ua_abs = next((a for a in abs_list if a.get("AB.L") == "UA"), abs_list[0] if abs_list else {})
        abstract_ua = ua_abs.get("AB.T", "")
    ipc_codes = data.get("IPC", []) if isinstance(data.get("IPC"), list) else []
    owners = data.get("I_73", [])
    owner_name = owners[0].get("I_73.N", "") if owners else ""
    owner_country = owners[0].get("I_73.C", "") if owners else ""
    inventors = data.get("I_72", [])
    inventor_names = [i.get("I_72.N.U") or i.get("I_72.N.R", "") for i in inventors] if inventors else []

    return (
        obj_type,
        record.get("obj_type"),
        record.get("app_number"),
        (record.get("app_date") or "")[:10] or None,
        record.get("registration_number"),
        (record.get("registration_date") or "")[:10] or None,
        title_ua or None, title_en or None, abstract_ua or None,
        ipc_codes or None,
        owner_name or None, owner_country or None,
        inventor_names or None,
        data.get("registration_status_color"),
        record.get("last_update"),
        json.dumps(data, ensure_ascii=False),
        # Dossier (top-level record fields, siblings of `data`) — LEXAI-1835
        json.dumps(record.get("data_payments"), ensure_ascii=False) if record.get("data_payments") else None,
        json.dumps(record.get("data_docs"), ensure_ascii=False) if record.get("data_docs") else None,
    )


def upsert_batch(table, records, obj_type_num):
    """Insert batch into DB synchronously (called from async via run_in_executor)."""
    if not records:
        return 0
    conn = get_db_conn()
    cur = conn.cursor()
    inserted = 0
    try:
        for record in records:
            try:
                if table == "opendata_trademarks":
                    vals = extract_trademark(record)
                    cur.execute("""
                        INSERT INTO opendata_trademarks
                            (app_number, app_date, registration_number, registration_date, expiry_date,
                             mark_text, holder_name, holder_edrpou, holder_country,
                             applicant_name, applicant_edrpou, nice_classes, nice_descriptions,
                             status, last_update, raw_data, data_payments, data_docs)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (app_number) DO UPDATE SET
                            registration_number=EXCLUDED.registration_number,
                            registration_date=EXCLUDED.registration_date,
                            holder_name=EXCLUDED.holder_name,
                            status=EXCLUDED.status,
                            last_update=EXCLUDED.last_update,
                            raw_data=EXCLUDED.raw_data,
                            data_payments=EXCLUDED.data_payments,
                            data_docs=EXCLUDED.data_docs,
                            imported_at=NOW()
                    """, vals)
                else:
                    vals = extract_patent(record, obj_type_num)
                    cur.execute("""
                        INSERT INTO opendata_patents
                            (obj_type, obj_type_name, app_number, app_date, registration_number, registration_date,
                             title_ua, title_en, abstract_ua, ipc_codes, owner_name, owner_country,
                             inventor_names, status, last_update, raw_data, data_payments, data_docs)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (app_number, obj_type) DO UPDATE SET
                            registration_number=EXCLUDED.registration_number,
                            title_ua=EXCLUDED.title_ua,
                            owner_name=EXCLUDED.owner_name,
                            status=EXCLUDED.status,
                            last_update=EXCLUDED.last_update,
                            raw_data=EXCLUDED.raw_data,
                            data_payments=EXCLUDED.data_payments,
                            data_docs=EXCLUDED.data_docs,
                            imported_at=NOW()
                    """, vals)
                inserted += 1
            except Exception as e:
                stats["failed"] += 1
                if stats["failed"] <= 5:
                    log.error(f"Record error: {e}")
        conn.commit()
    except Exception as e:
        conn.rollback()
        log.error(f"Batch error: {e}")
    finally:
        cur.close()
        conn.close()
    return inserted


class IPRateLimiter:
    """Per-IP rate limiter: max N concurrent + min interval between requests."""

    def __init__(self, ip: str, max_concurrent: int, interval: float):
        self.ip = ip
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.interval = interval
        self._last_request = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        await self.semaphore.acquire()
        async with self._lock:
            now = asyncio.get_event_loop().time()
            wait = self._last_request + self.interval - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = asyncio.get_event_loop().time()

    def release(self):
        self.semaphore.release()


async def fetch_page(session: aiohttp.ClientSession, url: str, limiter: IPRateLimiter) -> dict | None:
    """Fetch one page with rate limiting and retries."""
    for attempt in range(MAX_RETRIES):
        await limiter.acquire()
        try:
            connector = aiohttp.TCPConnector(local_addr=(limiter.ip, 0), ssl=False)
            async with aiohttp.ClientSession(connector=connector, timeout=TIMEOUT) as ip_session:
                async with ip_session.get(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "SecondLayer-Legal-Platform/2.0",
                }) as resp:
                    stats["requests"] += 1
                    if resp.status == 429:
                        wait = 5 * (2 ** attempt)
                        log.warning(f"Rate limited via {limiter.ip}, waiting {wait}s")
                        await asyncio.sleep(wait)
                        continue
                    if resp.status >= 500:
                        await asyncio.sleep(2 * (attempt + 1))
                        continue
                    if resp.status != 200:
                        log.error(f"HTTP {resp.status} for {url} via {limiter.ip}")
                        return None
                    return await resp.json()
        except asyncio.TimeoutError:
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 * (attempt + 1))
            else:
                log.error(f"TIMEOUT {url} via {limiter.ip}")
                return None
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 * (attempt + 1))
            else:
                log.error(f"FAILED {url} via {limiter.ip}: {e}")
                return None
        finally:
            limiter.release()
    return None


async def process_page(session, page_num, obj_type_num, table, limiter, loop):
    """Fetch page + upsert into DB."""
    url = f"{API_BASE}?obj_type={obj_type_num}&obj_state=2&page={page_num}"
    data = await fetch_page(session, url, limiter)
    if not data or not data.get("results"):
        return 0

    records = data["results"]
    # Run DB insert in thread pool (psycopg2 is sync)
    inserted = await loop.run_in_executor(None, upsert_batch, table, records, obj_type_num)
    stats["imported"] += inserted
    stats["pages_done"] += 1
    return inserted


async def import_dataset(name, from_page=None, to_page=None, ips=None):
    cfg = OBJ_TYPES[name]
    obj_type_num = cfg["type"]
    table = cfg["table"]
    if ips is None:
        ips = SOURCE_IPS

    loop = asyncio.get_event_loop()

    # Create per-IP rate limiters
    limiters = [IPRateLimiter(ip, THREADS_PER_IP, RATE_LIMIT) for ip in ips]

    # Get total count
    ssl_ctx = ssl.create_default_context()
    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        first_url = f"{API_BASE}?obj_type={obj_type_num}&obj_state=2&page=1"
        async with session.get(first_url) as resp:
            first = await resp.json()

    total = first.get("count", 0)
    per_page = len(first.get("results", []))
    total_pages = (total + per_page - 1) // per_page if per_page else 1

    start_page = from_page or 1
    end_page = min(to_page, total_pages) if to_page else total_pages
    pages = list(range(start_page, end_page + 1))

    total_workers = len(ips) * THREADS_PER_IP
    log.info(f"[{name}] Total: {total} records, {total_pages} pages")
    log.info(f"[{name}] {len(ips)} IPs × {THREADS_PER_IP} concurrent = {total_workers} workers")
    log.info(f"[{name}] Starting from page {start_page}, {len(pages)} pages to process")

    start_time = time.time()

    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        # Create all tasks — asyncio handles scheduling efficiently
        tasks = []
        for i, page_num in enumerate(pages):
            limiter = limiters[i % len(limiters)]
            tasks.append(process_page(session, page_num, obj_type_num, table, limiter, loop))

        # Process with progress reporting
        done_count = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            done_count += 1
            if done_count % 200 == 0 or done_count == len(pages):
                elapsed = time.time() - start_time
                rate = done_count / elapsed if elapsed > 0 else 0
                remaining = len(pages) - done_count
                eta = remaining / rate if rate > 0 else 0
                log.info(
                    f"[{name}] {done_count}/{len(pages)} ({done_count*100//len(pages)}%) "
                    f"| {stats['imported']} imported | {rate:.1f} pg/s | ETA: {eta:.0f}s "
                    f"| reqs: {stats['requests']} | errors: {stats['failed']}"
                )

    elapsed = time.time() - start_time
    log.info(f"[{name}] Done in {elapsed:.0f}s: {stats['imported']} imported, {stats['failed']} errors, {stats['requests']} requests")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", choices=list(OBJ_TYPES.keys()) + ["all"], default="all", nargs="?")
    parser.add_argument("--from-page", type=int, default=None)
    parser.add_argument("--to-page", type=int, default=None)
    parser.add_argument("--ips", nargs="+", default=SOURCE_IPS)
    args = parser.parse_args()

    ips = [ip.strip() for ip in args.ips if ip.strip()]
    datasets = list(OBJ_TYPES.keys()) if args.dataset == "all" else [args.dataset]

    log.info("=" * 60)
    log.info("  UIPV/NIPO Async Multi-IP Import")
    log.info(f"  IPs: {len(ips)}, Threads/IP: {THREADS_PER_IP}, Datasets: {datasets}")
    if args.to_page:
        log.info(f"  Range: {args.from_page or 1} → {args.to_page}")
    log.info("=" * 60)

    for ds in datasets:
        stats.update({"imported": 0, "failed": 0, "requests": 0, "pages_done": 0})
        await import_dataset(ds, from_page=args.from_page, to_page=args.to_page, ips=ips)

    log.info("All done!")


if __name__ == "__main__":
    asyncio.run(main())
