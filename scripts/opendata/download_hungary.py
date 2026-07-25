#!/usr/bin/env python3
"""Download Hungarian court decisions from eakta.birosag.hu + Constitutional Court."""

import os
import sys
import json
import time
import hashlib
import requests
import urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

OUT_DIR = Path(os.environ.get("OUT_DIR", "/home/ubuntu/opendata/hungary"))
EAKTA_DIR = OUT_DIR / "eakta"
DOCX_DIR = OUT_DIR / "eakta-docx"
CC_DIR = OUT_DIR / "constitutional"
HUNCOURT_DIR = OUT_DIR / "huncourt-osf"
CHECKPOINT = OUT_DIR / "checkpoint.json"

SEARCH_URL = "https://eakta.birosag.hu/AnonimizaltHatarozat/Search"
DOWNLOAD_URL = "https://eakta.birosag.hu/hatarozat-letoltes/"
CC_SEARCH_URL = "https://api.alkotmanybirosag.hu/Talalat"
CC_DETAIL_URL = "https://api.alkotmanybirosag.hu/TalalatById"
HUNCOURT_CSV_URL = "https://osf.io/download/3mzs8/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

KOLLEGIUMS = ["büntető", "gazdasági", "közigazgatási", "munkaügyi", "polgári"]
DECISION_TYPES = ["Ítélet", "Végzés", "Egyéb"]
YEARS = list(range(1998, 2027))

LOCAL_IPS = [
    "172.31.29.20",    # primary  -> 18.192.189.254
    "172.31.21.47",    # existing -> 18.198.12.212
    "172.31.21.255",   # EIP -> 3.78.31.142
    "172.31.31.40",    # EIP -> 18.195.236.19
    "172.31.22.206",   # EIP -> 18.192.230.133
    "172.31.28.109",   # EIP -> 35.156.196.155
    "172.31.27.31",    # EIP -> 63.180.100.247
    "172.31.19.142",   # EIP -> 63.179.123.244
    "172.31.19.20",    # EIP -> 63.184.218.152
    "172.31.17.145",   # EIP -> 63.182.48.11
    "172.31.16.240",   # EIP -> 63.181.229.252
    "172.31.21.126",   # EIP -> 3.77.163.254
    "172.31.21.214",   # EIP -> 18.157.90.57
    "172.31.27.133",   # EIP -> 18.197.134.106
    "172.31.22.179",   # EIP -> 63.184.196.220
]

import itertools
_ip_cycle = itertools.cycle(LOCAL_IPS)


class SourceAddressAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, source_address, **kwargs):
        self._source_address = source_address
        super().__init__(**kwargs)

    def send(self, request, **kwargs):
        import urllib3
        conn = self.get_connection(request.url)
        conn.conn_kw = conn.conn_kw or {}
        conn.conn_kw["source_address"] = (self._source_address, 0)
        return super().send(request, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs["source_address"] = (self._source_address, 0)
        super().init_poolmanager(*args, **kwargs)


def get_session_for_ip(ip):
    s = requests.Session()
    s.headers.update(HEADERS)
    adapter = SourceAddressAdapter(source_address=ip)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSIONS = {ip: get_session_for_ip(ip) for ip in LOCAL_IPS}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def load_checkpoint():
    if CHECKPOINT.exists():
        return json.loads(CHECKPOINT.read_text())
    return {"completed_combos": [], "downloaded_docx": [], "cc_years_done": []}


def save_checkpoint(cp):
    CHECKPOINT.write_text(json.dumps(cp, ensure_ascii=False, indent=2))


def search_eakta(year, kollegium, decision_type, start_index=0, count=100):
    data = {
        "ResultCount": count,
        "ResultStartIndex": start_index,
        "ResultSortExpression": "Id asc",
        "MeghozatalIdejeTol": str(year),
        "MeghozatalIdejeIg": str(year),
        "Kollegium": kollegium,
        "HatarozatFajta": decision_type,
    }
    for attempt in range(10):
        try:
            r = SESSION.post(SEARCH_URL, data=data, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            wait = (attempt + 1) * 5
            print(f"    Retry {attempt+1}/10 ({e}), wait {wait}s", flush=True)
            time.sleep(wait)
    return None


def scrape_eakta_combo(year, kollegium, decision_type, out_dir):
    combo_key = f"{year}_{kollegium}_{decision_type}"
    combo_file = out_dir / f"{combo_key}.jsonl"

    all_items = []
    start = 0
    while True:
        resp = search_eakta(year, kollegium, decision_type, start)
        if not resp or not resp.get("Success") or not resp.get("List"):
            break
        items = resp["List"]
        all_items.extend(items)
        if len(items) < 100:
            break
        start += 100
        time.sleep(0.5)

    if all_items:
        with open(combo_file, "w", encoding="utf-8") as f:
            for item in all_items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    return combo_key, len(all_items)


def download_docx(item, docx_dir, worker_session):
    court = item.get("MeghozoBirosag", "")
    case_num = item.get("Azonosito", "")
    index_id = item.get("IndexId", "")
    egyedi = item.get("EgyediAzonosito", "")

    if not court or not case_num or not index_id:
        return egyedi, False

    safe_name = hashlib.md5(egyedi.encode()).hexdigest()
    out_path = docx_dir / f"{safe_name}.docx"
    if out_path.exists() and out_path.stat().st_size > 100:
        return egyedi, True

    params = {
        "birosagName": court,
        "ugyszam": case_num,
        "azonosito": index_id,
    }
    url = DOWNLOAD_URL + "?" + urllib.parse.urlencode(params)

    for attempt in range(5):
        try:
            r = worker_session.get(url, timeout=45)
            if r.status_code == 200 and len(r.content) > 100:
                out_path.write_bytes(r.content)
                return egyedi, True
            time.sleep(2 + attempt * 2)
        except Exception:
            time.sleep(3 + attempt * 3)

    return egyedi, False


def _worker_download_batch(args):
    """Each worker gets its own IP and batch of items."""
    ip, items, docx_dir = args
    session = get_session_for_ip(ip)
    results = []
    for item in items:
        egyedi, ok = download_docx(item, docx_dir, session)
        results.append((egyedi, ok))
        time.sleep(0.2)
    return results


def run_eakta(workers=24):
    EAKTA_DIR.mkdir(parents=True, exist_ok=True)
    DOCX_DIR.mkdir(parents=True, exist_ok=True)

    cp = load_checkpoint()
    done = set(cp["completed_combos"])

    combos = []
    for year in YEARS:
        for kol in KOLLEGIUMS:
            for dt in DECISION_TYPES:
                key = f"{year}_{kol}_{dt}"
                if key not in done:
                    combos.append((year, kol, dt))

    print(f"=== eakta.birosag.hu: {len(combos)} combos to scrape ({len(done)} done) ===", flush=True)

    total_decisions = 0
    for i, (year, kol, dt) in enumerate(combos):
        combo_key, count = scrape_eakta_combo(year, kol, dt, EAKTA_DIR)
        total_decisions += count
        cp["completed_combos"].append(combo_key)
        if (i + 1) % 10 == 0:
            save_checkpoint(cp)
        print(f"  [{i+1}/{len(combos)}] {combo_key}: {count} decisions", flush=True)

    save_checkpoint(cp)
    print(f"\nMetadata done: {total_decisions} new decisions scraped", flush=True)

    # Collect all items for DOCX download
    all_items = []
    for f in sorted(EAKTA_DIR.glob("*.jsonl")):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                item = json.loads(line)
                all_items.append(item)

    downloaded = set(cp.get("downloaded_docx", []))
    to_download = [it for it in all_items if it.get("EgyediAzonosito") not in downloaded]
    print(f"\n=== DOCX download: {len(to_download)} to fetch ({len(downloaded)} done) ===", flush=True)

    if not to_download:
        print("  Nothing to download", flush=True)
        return

    # Distribute items across IPs: 4 workers per IP
    workers_per_ip = 4
    num_workers = len(LOCAL_IPS) * workers_per_ip
    chunk_size = max(1, len(to_download) // num_workers)
    batches = []
    for wi in range(num_workers):
        ip = LOCAL_IPS[wi % len(LOCAL_IPS)]
        start = wi * chunk_size
        end = start + chunk_size if wi < num_workers - 1 else len(to_download)
        if start < len(to_download):
            batches.append((ip, to_download[start:end], DOCX_DIR))

    print(f"  {len(batches)} workers ({workers_per_ip} per IP, {len(LOCAL_IPS)} IPs)", flush=True)

    success = 0
    fail = 0
    processed = 0
    with ThreadPoolExecutor(max_workers=num_workers) as pool:
        futures = {pool.submit(_worker_download_batch, batch): batch for batch in batches}
        for fut in as_completed(futures):
            results = fut.result()
            for egyedi, ok in results:
                if ok:
                    success += 1
                    cp["downloaded_docx"].append(egyedi)
                else:
                    fail += 1
                processed += 1
            save_checkpoint(cp)
            print(f"  DOCX progress: {processed}/{len(to_download)} ({success} ok, {fail} fail)", flush=True)

    save_checkpoint(cp)
    print(f"\nDOCX done: {success} downloaded, {fail} failed", flush=True)


def run_constitutional_court():
    CC_DIR.mkdir(parents=True, exist_ok=True)
    HUNCOURT_DIR.mkdir(parents=True, exist_ok=True)

    cp = load_checkpoint()

    # 1. Download HUNCOURT CSV from OSF (1990-2021)
    csv_path = HUNCOURT_DIR / "huncourt.csv"
    if not csv_path.exists():
        print("=== Downloading HUNCOURT CSV from OSF ===", flush=True)
        r = requests.get(HUNCOURT_CSV_URL, stream=True, timeout=300)
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        downloaded = 0
        with open(csv_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    print(f"  {downloaded / 1e6:.1f} / {total / 1e6:.1f} MB", end="\r", flush=True)
        print(f"\n  HUNCOURT CSV: {csv_path.stat().st_size / 1e6:.1f} MB", flush=True)
    else:
        print(f"HUNCOURT CSV already exists: {csv_path.stat().st_size / 1e6:.1f} MB", flush=True)

    # 2. Scrape 2022-2026 from alkotmanybirosag.hu API
    cc_done = set(cp.get("cc_years_done", []))
    for year in range(2022, 2027):
        if str(year) in cc_done:
            print(f"CC {year}: already done", flush=True)
            continue

        print(f"\n=== Constitutional Court {year} ===", flush=True)
        params = {"OpenAgent": "", "hatarozat_evszam": str(year)}
        headers = {
            "User-Agent": HEADERS["User-Agent"],
            "Origin": "https://alkotmanybirosag.hu",
        }

        try:
            r = requests.get(CC_SEARCH_URL, params=params, headers=headers, timeout=60)
            r.raise_for_status()
            results = r.json()
        except Exception as e:
            print(f"  Error fetching {year}: {e}", flush=True)
            continue

        if isinstance(results, dict) and "darab" in results:
            print(f"  Too many results for {year}, skipping (should not happen per-year)", flush=True)
            continue

        print(f"  {len(results)} decisions found", flush=True)

        year_items = []
        for j, item in enumerate(results):
            url_field = item.get("url", [""])[0]
            doc_id = ""
            if "/0/" in url_field and "?OpenDocument" in url_field:
                doc_id = url_field.split("/0/")[-1].split("?")[0]

            detail = None
            if doc_id:
                try:
                    dr = requests.get(f"{CC_DETAIL_URL}?id={doc_id}", headers=headers, timeout=60)
                    dr.raise_for_status()
                    detail = dr.json()
                    time.sleep(0.3)
                except Exception as e:
                    print(f"    Detail error for {doc_id}: {e}", flush=True)

            year_items.append({
                "search": item,
                "detail": detail,
                "doc_id": doc_id,
            })

            if (j + 1) % 50 == 0:
                print(f"  [{j+1}/{len(results)}] details fetched", flush=True)

        out_file = CC_DIR / f"cc_{year}.json"
        out_file.write_text(json.dumps(year_items, ensure_ascii=False, indent=2))
        cp["cc_years_done"].append(str(year))
        save_checkpoint(cp)
        print(f"  Saved {len(year_items)} to {out_file.name}", flush=True)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "eakta"):
        run_eakta(workers=20)

    if mode in ("all", "cc"):
        run_constitutional_court()

    print("\n=== All done ===", flush=True)


if __name__ == "__main__":
    main()
