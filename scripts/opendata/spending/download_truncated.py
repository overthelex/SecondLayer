#!/usr/bin/env python3
"""
Second pass: download truncated days from spending.gov.ua.
Reads truncated_days.txt, splits each day by documentDate windows.
Uses 5 source IPs × 1 thread each (5 workers).
"""

import json
import os
import sys
import socket
import ssl
import http.client
import time
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# --- Config ---
API_BASE = "https://api.spending.gov.ua/api/v2/disposers"
API_HOST = "api.spending.gov.ua"
SOURCE_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
]
MAX_RETRIES = 7
RETRY_DELAY = 3
TIMEOUT = 120
OUTPUT_DIR = "/home/ubuntu/SecondLayer/scripts/opendata/spending/data"
MAX_DOCS = 950

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("spending_pass2.log"),
    ],
)
log = logging.getLogger(__name__)

_dns_cache = {}
_dns_lock = Lock()
stats = {"done": 0, "failed": 0, "documents": 0, "requests": 0}
stats_lock = Lock()


def resolve_host(host):
    with _dns_lock:
        if host not in _dns_cache:
            _dns_cache[host] = socket.getaddrinfo(host, 443)[0][4][0]
        return _dns_cache[host]


def fetch_url(url, source_ip):
    host_ip = resolve_host(API_HOST)
    path = url.replace(f"https://{API_HOST}", "")
    context = ssl.create_default_context()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((source_ip, 0))
        sock.settimeout(TIMEOUT)
        sock.connect((host_ip, 443))
        ssock = context.wrap_socket(sock, server_hostname=API_HOST)
        conn = http.client.HTTPSConnection(API_HOST)
        conn.sock = ssock
        conn.request("GET", path, headers={
            "Accept": "application/json",
            "User-Agent": "SecondLayer-OpenData/1.0",
        })
        resp = conn.getresponse()
        data = resp.read()
        status = resp.status
        conn.close()
        return status, data
    except Exception:
        try:
            sock.close()
        except Exception:
            pass
        raise


def fetch_json(url, source_ip, label=""):
    for attempt in range(MAX_RETRIES):
        try:
            with stats_lock:
                stats["requests"] += 1
            status, raw = fetch_url(url, source_ip)
            if status in (429,):
                time.sleep(RETRY_DELAY * (2 ** attempt) + 5)
                continue
            if status in (502, 503, 504):
                time.sleep(RETRY_DELAY * (2 ** attempt))
                continue
            if status != 200:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (2 ** attempt))
                    continue
                return None
            return json.loads(raw)
        except (ConnectionError, socket.timeout, OSError, TimeoutError) as e:
            time.sleep(RETRY_DELAY * (2 ** attempt))
        except json.JSONDecodeError:
            return None
    return None


def split_half(start, end):
    days = (end - start).days
    if days <= 0:
        return [(start, end)]
    mid = start + timedelta(days=days // 2)
    return [(start, mid), (mid + timedelta(days=1), end)]


def fetch_recursive(doc_type, sign_str, df, dt, ip, depth=0):
    fs = df.strftime("%Y-%m-%d")
    ts = dt.strftime("%Y-%m-%d")
    url = (f"{API_BASE}/{doc_type}?signDateFrom={sign_str}&signDateTo={sign_str}"
           f"&documentDateFrom={fs}&documentDateTo={ts}")
    label = f"{doc_type}/{sign_str}/doc={fs}..{ts}"

    data = fetch_json(url, ip, label)
    if data is None:
        log.error(f"Failed: {label}")
        return []

    size = data.get("size", 0)
    count = data.get("count", 0)
    more = data.get("moreThenCount", False)

    if (count > MAX_DOCS or more) and df < dt and depth < 12:
        log.debug(f"  Split {label}: count={count} depth={depth}")
        docs = []
        for sf, st in split_half(df, dt):
            docs.extend(fetch_recursive(doc_type, sign_str, sf, st, ip, depth + 1))
        return docs

    if count > MAX_DOCS and df == dt:
        log.warning(f"  Cannot split {label}: count={count}, got {size}")

    return data.get("documents", [])


def process_day(doc_type, sign_str, ip):
    sign_date = datetime.strptime(sign_str, "%Y-%m-%d")
    out_file = os.path.join(OUTPUT_DIR, doc_type, f"{sign_str}.json")
    label = f"{doc_type}/{sign_str}"

    # Skip if already processed (no _truncated marker)
    if os.path.exists(out_file):
        try:
            with open(out_file, "r") as f:
                # Read only first 200 bytes to check for marker
                head = f.read(200)
            if "_truncated" not in head and "_merged_from_splits" in head:
                with stats_lock:
                    stats["done"] += 1
                return True
        except Exception:
            pass

    # 6-month lookback in monthly windows — fetch ALL windows in parallel
    cursor = sign_date
    lookback = sign_date - timedelta(days=180)
    windows = []
    for _ in range(7):
        win_end = cursor
        win_start = cursor.replace(day=1)
        if win_start < lookback:
            win_start = lookback
        windows.append((win_start, win_end))
        cursor = win_start - timedelta(days=1)
        if cursor < lookback:
            break

    all_docs = []
    with ThreadPoolExecutor(max_workers=len(windows)) as pool:
        futures = [pool.submit(fetch_recursive, doc_type, sign_str, ws, we, ip)
                   for ws, we in windows]
        for f in futures:
            chunk = f.result()
            if chunk:
                all_docs.extend(chunk)

    # Deduplicate
    seen = set()
    unique = []
    for doc in all_docs:
        did = doc.get("id")
        if did not in seen:
            seen.add(did)
            unique.append(doc)

    result = {
        "size": len(unique),
        "count": len(unique),
        "moreThenCount": False,
        "documents": unique,
        "_merged_from_splits": True,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    with stats_lock:
        stats["done"] += 1
        stats["documents"] += len(unique)

    log.info(f"DONE {label}: {len(unique)} unique docs via {ip}")
    return True


def main():
    truncated_file = os.path.join(OUTPUT_DIR, "truncated_days.txt")
    if not os.path.exists(truncated_file):
        log.error(f"No {truncated_file} found")
        return

    # Read task list
    tasks = []
    seen = set()
    with open(truncated_file) as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                doc_type, date_str = parts[0], parts[1]
                key = f"{doc_type}/{date_str}"
                if key not in seen:
                    seen.add(key)
                    tasks.append((doc_type, date_str))

    total = len(tasks)
    log.info(f"Second pass: {total} truncated days, 5 IPs x 1 thread = 5 workers")

    # Round-robin assign to IPs
    ip_tasks = {ip: [] for ip in SOURCE_IPS}
    for i, (doc_type, date_str) in enumerate(tasks):
        ip = SOURCE_IPS[i % len(SOURCE_IPS)]
        ip_tasks[ip].append((doc_type, date_str, ip))

    threads_per_ip = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    log.info(f"Using {threads_per_ip} threads per IP = {len(SOURCE_IPS) * threads_per_ip} workers")

    all_futures = []
    executors = []
    for ip, task_list in ip_tasks.items():
        executor = ThreadPoolExecutor(max_workers=threads_per_ip)
        executors.append(executor)
        for doc_type, date_str, src_ip in task_list:
            future = executor.submit(process_day, doc_type, date_str, src_ip)
            all_futures.append(future)

    completed = 0
    start_time = time.time()
    for future in as_completed(all_futures):
        completed += 1
        if completed % 10 == 0 or completed == total:
            elapsed = time.time() - start_time
            rate = completed / elapsed if elapsed > 0 else 0
            eta = (total - completed) / rate if rate > 0 else 0
            log.info(
                f"Progress: {completed}/{total} ({completed*100//total}%) "
                f"| {rate:.2f} days/s | ETA: {eta/60:.0f}m "
                f"| docs: {stats['documents']} | reqs: {stats['requests']} "
                f"| failed: {stats['failed']}"
            )

    for e in executors:
        e.shutdown(wait=True)

    elapsed = time.time() - start_time
    log.info(f"\nDone in {elapsed/60:.1f} minutes")
    log.info(f"Completed: {stats['done']} | Failed: {stats['failed']} | "
             f"Requests: {stats['requests']} | Total docs: {stats['documents']}")


if __name__ == "__main__":
    main()
