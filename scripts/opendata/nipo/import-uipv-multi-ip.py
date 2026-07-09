#!/usr/bin/env python3
"""
Multi-IP parallel import from sis.nipo.gov.ua into PostgreSQL.
Each IP does 1 req/sec. With 10 IPs = 10 req/sec = ~10x speedup.

Usage:
    python3 import-uipv-multi-ip.py trademarks              # only trademarks
    python3 import-uipv-multi-ip.py all                      # all types
    python3 import-uipv-multi-ip.py trademarks --from-page 13500  # resume
"""

import argparse
import json
import os
import sys
import time
import socket
import ssl
import http.client
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler(sys.stdout)])
log = logging.getLogger(__name__)

# --- Config ---
API_HOST = "sis.nipo.gov.ua"
API_PATH = "/api/v1/open-data/"
# Prod secondary private IPs, each mapped to a distinct Elastic IP (public egress)
# = one independent SIS rate-limit bucket. Refreshed 2026-07-09 from AWS
# describe-addresses on instance i-04e39a795576e33f0 (ENI eni-043d37237c0523292);
# the previous list had drifted (4 of 10 EIPs released/reassigned).
SOURCE_IPS = [
    "172.31.16.240", "172.31.17.145", "172.31.19.20", "172.31.19.142", "172.31.21.47",
    "172.31.21.126", "172.31.21.214", "172.31.21.255", "172.31.22.179", "172.31.22.206",
    "172.31.27.31", "172.31.27.133", "172.31.28.109", "172.31.29.20", "172.31.31.40",
]
RATE_LIMIT_MS = 1100  # per IP
MAX_RETRIES = 5
TIMEOUT = 30
CHECKPOINT_DIR = "/tmp/uipv-import-checkpoints"

OBJ_TYPES = {
    "trademarks": {"type": 4, "table": "opendata_trademarks"},
    "patents": {"type": 1, "table": "opendata_patents"},
    "utility_models": {"type": 2, "table": "opendata_patents"},
    "designs": {"type": 6, "table": "opendata_patents"},
}

# --- DNS cache ---
_dns_cache = {}
_dns_lock = Lock()

def resolve_host(host):
    with _dns_lock:
        if host not in _dns_cache:
            _dns_cache[host] = socket.getaddrinfo(host, 443)[0][4][0]
        return _dns_cache[host]

# --- Stats ---
stats = {"imported": 0, "failed": 0, "requests": 0}
stats_lock = Lock()

# --- HTTP with source IP ---
def fetch_json(path, source_ip=None):
    """Fetch JSON from API bound to source_ip."""
    host_ip = resolve_host(API_HOST)
    for attempt in range(MAX_RETRIES):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            if source_ip:
                sock.bind((source_ip, 0))
            sock.settimeout(TIMEOUT)
            sock.connect((host_ip, 443))
            context = ssl.create_default_context()
            ssock = context.wrap_socket(sock, server_hostname=API_HOST)
            conn = http.client.HTTPSConnection(API_HOST)
            conn.sock = ssock
            conn.request("GET", path, headers={
                "Host": API_HOST,
                "Accept": "application/json",
                "User-Agent": "SecondLayer-Legal-Platform/1.0",
            })
            resp = conn.getresponse()
            data = resp.read()
            status = resp.status
            conn.close()

            if status == 429:
                wait = 5 * (2 ** attempt)
                log.warning(f"Rate limited via {source_ip}, waiting {wait}s")
                time.sleep(wait)
                continue
            if status >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            if status != 200:
                log.error(f"HTTP {status} for {path} via {source_ip}")
                return None

            with stats_lock:
                stats["requests"] += 1
            return json.loads(data)
        except Exception as e:
            try:
                sock.close()
            except Exception:
                pass
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 * (attempt + 1))
            else:
                log.error(f"FAILED {path} via {source_ip}: {e}")
                return None
    return None

# --- DB ---
def get_db_conn():
    import psycopg2
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        port=int(os.environ.get("POSTGRES_PORT", "5438")),
        user=os.environ.get("POSTGRES_USER", "secondlayer"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        dbname=os.environ.get("POSTGRES_DB", "secondlayer_prod"),
    )

# --- Extract trademark ---
def extract_trademark(record):
    data = record.get("data", {})

    # Mark text
    mark_text = ""
    wm = (record.get("WordMarkSpecification") or {}).get("MarkSignificantVerbalElement")
    if isinstance(wm, list):
        mark_text = " ".join(w.get("#text", "") for w in wm if w.get("#text"))

    # Holder
    holder_name, holder_edrpou, holder_country = "", "", ""
    holders = (data.get("HolderDetails") or {}).get("Holder", [])
    if holders:
        h = (holders[0].get("HolderAddressBook") or {}).get("FormattedNameAddress", {})
        fn = (h.get("Name") or {}).get("FreeFormatName", {})
        holder_name = (fn.get("FreeFormatNameDetails") or {}).get("FreeFormatNameLine", "")
        holder_edrpou = fn.get("EDRPOU", "")
        holder_country = (h.get("Address") or {}).get("AddressCountryCode", "")

    # Applicant
    applicant_name, applicant_edrpou = "", ""
    applicants = (data.get("ApplicantDetails") or {}).get("Applicant", [])
    if applicants:
        a = (applicants[0].get("ApplicantAddressBook") or {}).get("FormattedNameAddress", {})
        fn = (a.get("Name") or {}).get("FreeFormatName", {})
        applicant_name = (fn.get("FreeFormatNameDetails") or {}).get("FreeFormatNameLine", "")
        applicant_edrpou = fn.get("EDRPOU", "")

    # Nice classes
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
        nice_classes or None, None,  # nice_descriptions skipped for speed
        data.get("application_status") or data.get("registration_status_color"),
        record.get("last_update"),
        json.dumps(data, ensure_ascii=False),
        # Dossier (top-level record fields, siblings of `data`) — LEXAI-1835
        json.dumps(record.get("data_payments"), ensure_ascii=False) if record.get("data_payments") else None,
        json.dumps(record.get("data_docs"), ensure_ascii=False) if record.get("data_docs") else None,
    )

# --- Extract patent ---
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

# --- Worker: fetch one page and insert ---
def process_page(page_num, obj_type_num, table, source_ip):
    """Fetch one page and insert into DB. Returns count inserted."""
    path = f"{API_PATH}?obj_type={obj_type_num}&obj_state=2&page={page_num}"
    data = fetch_json(path, source_ip)
    if not data or not data.get("results"):
        return 0

    records = data["results"]
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
                if stats["failed"] < 10:
                    log.error(f"Record error page {page_num}: {e}")
                with stats_lock:
                    stats["failed"] += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        log.error(f"Batch error page {page_num}: {e}")
    finally:
        cur.close()
        conn.close()

    # Rate limit per IP
    time.sleep(RATE_LIMIT_MS / 1000)
    return inserted

# --- Main ---
def import_dataset(name, from_page=None, ips=None):
    cfg = OBJ_TYPES[name]
    obj_type_num = cfg["type"]
    table = cfg["table"]
    if ips is None:
        ips = SOURCE_IPS

    # Load checkpoint
    cp_file = os.path.join(CHECKPOINT_DIR, f"uipv_{name}.json")
    if from_page:
        start_page = from_page
    elif os.path.exists(cp_file):
        cp = json.load(open(cp_file))
        start_page = cp.get("page", 1)
        log.info(f"Resuming {name} from checkpoint page {start_page}")
    else:
        start_page = 1

    # Get total count
    first = fetch_json(f"{API_PATH}?obj_type={obj_type_num}&obj_state=2&page=1", ips[0])
    if not first:
        log.error(f"Cannot fetch first page for {name}")
        return
    total = first.get("count", 0)
    per_page = len(first.get("results", []))
    total_pages = (total + per_page - 1) // per_page if per_page else 1
    log.info(f"[{name}] Total: {total} records, {total_pages} pages, starting from page {start_page}")

    pages = list(range(start_page, total_pages + 1))
    if not pages:
        log.info(f"[{name}] Nothing to import")
        return

    total_threads = len(ips)  # 1 thread per IP to respect rate limit

    log.info(f"[{name}] Using {len(ips)} IPs, {len(pages)} pages to process")

    completed = 0
    start_time = time.time()

    # Process with thread pool — 1 thread per IP
    with ThreadPoolExecutor(max_workers=total_threads) as executor:
        futures = {}
        for i, page_num in enumerate(pages):
            ip = ips[i % len(ips)]
            futures[executor.submit(process_page, page_num, obj_type_num, table, ip)] = page_num

        for future in as_completed(futures):
            page_num = futures[future]
            try:
                inserted = future.result()
                with stats_lock:
                    stats["imported"] += inserted
            except Exception as e:
                log.error(f"Page {page_num} error: {e}")

            completed += 1
            if completed % 500 == 0 or completed == len(pages):
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (len(pages) - completed) / rate / 60 if rate > 0 else 0
                log.info(
                    f"[{name}] {completed}/{len(pages)} ({completed*100//len(pages)}%) "
                    f"| {stats['imported']} imported | {rate:.1f} pg/s | ETA: {eta:.0f}m "
                    f"| reqs: {stats['requests']} | errors: {stats['failed']}"
                )

                # Checkpoint
                os.makedirs(CHECKPOINT_DIR, exist_ok=True)
                json.dump({"page": page_num, "imported": stats["imported"], "ts": time.strftime("%Y-%m-%dT%H:%M:%S")},
                          open(cp_file, "w"))

    elapsed = time.time() - start_time
    log.info(f"[{name}] Done in {elapsed/60:.1f}m: {stats['imported']} imported, {stats['failed']} errors")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", choices=list(OBJ_TYPES.keys()) + ["all"], default="all", nargs="?")
    parser.add_argument("--from-page", type=int, default=None)
    parser.add_argument("--ips", nargs="+", default=SOURCE_IPS)
    args = parser.parse_args()

    ips = args.ips

    datasets = list(OBJ_TYPES.keys()) if args.dataset == "all" else [args.dataset]

    # Override global SOURCE_IPS for import_dataset
    import_uipv_ips = ips

    log.info("=" * 60)
    log.info("  UIPV/NIPO Multi-IP Import")
    log.info(f"  IPs: {len(import_uipv_ips)}, Datasets: {datasets}")
    log.info("=" * 60)

    for ds in datasets:
        import_dataset(ds, from_page=args.from_page, ips=ips)

    log.info("All done!")


if __name__ == "__main__":
    main()
