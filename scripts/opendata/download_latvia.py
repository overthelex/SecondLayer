#!/usr/bin/env python3
"""Download Latvian court decisions from gateway.elieta.lv API (424K+ decisions)."""

import os
import sys
import json
import time
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import itertools

OUT_DIR = Path(os.environ.get("OUT_DIR", "/home/ubuntu/opendata/baltics/latvia"))
META_DIR = OUT_DIR / "metadata"
PDF_DIR = OUT_DIR / "pdfs"
CHECKPOINT = OUT_DIR / "checkpoint.json"

API_URL = "https://gateway.elieta.lv/api/v1/PublicMaterial"
DOWNLOAD_URL = "https://gateway.elieta.lv/api/v1/PublicMaterialDownload/{file_id}"
PAGE_SIZE = 100

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Content-Type": "application/json",
}

LOCAL_IPS = [
    "172.31.29.20", "172.31.21.47", "172.31.21.255", "172.31.31.40",
    "172.31.22.206", "172.31.28.109", "172.31.27.31", "172.31.19.142",
    "172.31.19.20", "172.31.17.145", "172.31.16.240", "172.31.21.126",
    "172.31.21.214", "172.31.27.133", "172.31.22.179",
]


class SourceAddressAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, source_address, **kwargs):
        self._source_address = source_address
        super().__init__(**kwargs)

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


SESSIONS = [get_session_for_ip(ip) for ip in LOCAL_IPS]
_session_cycle = itertools.cycle(SESSIONS)

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def load_checkpoint():
    if CHECKPOINT.exists():
        return json.loads(CHECKPOINT.read_text())
    return {"pages_done": 0, "pdfs_done": []}


def save_checkpoint(cp):
    CHECKPOINT.write_text(json.dumps(cp, ensure_ascii=False))


def fetch_page(page):
    payload = {"page": page, "limit": PAGE_SIZE}
    for attempt in range(5):
        try:
            r = SESSION.post(API_URL, json=payload, timeout=60)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            time.sleep((attempt + 1) * 3)
    return None


def download_metadata():
    META_DIR.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()
    start_page = cp.get("pages_done", 0) + 1

    first = fetch_page(1)
    if not first:
        print("ERROR: cannot reach API", flush=True)
        return
    total = first["totalResults"]
    total_pages = first["totalPages"]
    print(f"=== Latvia: {total:,} decisions, {total_pages:,} pages ===", flush=True)

    if start_page == 1:
        out = META_DIR / "page_00001.jsonl"
        with open(out, "w", encoding="utf-8") as f:
            for item in first["items"]:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        cp["pages_done"] = 1
        save_checkpoint(cp)
        print(f"  [1/{total_pages}]", flush=True)
        start_page = 2

    for page in range(start_page, total_pages + 1):
        data = fetch_page(page)
        if not data or not data.get("items"):
            print(f"  [{page}/{total_pages}] empty/error, stopping", flush=True)
            break

        out = META_DIR / f"page_{page:05d}.jsonl"
        with open(out, "w", encoding="utf-8") as f:
            for item in data["items"]:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

        cp["pages_done"] = page
        if page % 50 == 0:
            save_checkpoint(cp)
            print(f"  [{page}/{total_pages}] {page * PAGE_SIZE:,} records", flush=True)

        time.sleep(0.3)

    save_checkpoint(cp)
    print(f"  Metadata done: {cp['pages_done']} pages", flush=True)


def download_pdf(file_id, pdf_dir):
    out_path = pdf_dir / f"{file_id}.pdf"
    if out_path.exists() and out_path.stat().st_size > 500:
        return file_id, True

    url = DOWNLOAD_URL.format(file_id=file_id)
    session = next(_session_cycle)

    for attempt in range(5):
        try:
            r = session.get(url, timeout=60)
            if r.status_code == 200 and len(r.content) > 500:
                out_path.write_bytes(r.content)
                return file_id, True
            time.sleep((attempt + 1) * 2)
        except Exception:
            time.sleep((attempt + 1) * 3)
    return file_id, False


def download_pdfs(workers=60):
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()
    done = set(cp.get("pdfs_done", []))

    file_ids = []
    for f in sorted(META_DIR.glob("*.jsonl")):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                item = json.loads(line)
                files = item.get("materialFiles", [])
                for mf in files:
                    fid = mf.get("id", "")
                    if fid and fid not in done:
                        file_ids.append(fid)

    print(f"\n=== Latvia PDFs: {len(file_ids)} to download ({len(done)} done) ===", flush=True)

    success = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(download_pdf, fid, PDF_DIR): fid for fid in file_ids}
        for i, fut in enumerate(as_completed(futures)):
            fid, ok = fut.result()
            if ok:
                success += 1
                cp["pdfs_done"].append(fid)
            else:
                fail += 1
            if (i + 1) % 1000 == 0:
                save_checkpoint(cp)
                print(f"  [{i+1}/{len(file_ids)}] {success} ok, {fail} fail", flush=True)

    save_checkpoint(cp)
    print(f"  PDFs done: {success} ok, {fail} fail", flush=True)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "metadata"):
        download_metadata()

    if mode in ("all", "pdfs"):
        download_pdfs(workers=20)

    print("\n=== Latvia done ===", flush=True)


if __name__ == "__main__":
    main()
