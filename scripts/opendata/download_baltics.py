#!/usr/bin/env python3
"""Download court decisions from Lithuania, Latvia, Estonia."""

import os
import sys
import json
import time
import hashlib
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests

OUT_DIR = Path(os.environ.get("OUT_DIR", "/home/ubuntu/opendata/baltics"))
LT_DIR = OUT_DIR / "lithuania"
LV_DIR = OUT_DIR / "latvia"
EE_DIR = OUT_DIR / "estonia"
CHECKPOINT = OUT_DIR / "checkpoint.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def load_checkpoint():
    if CHECKPOINT.exists():
        return json.loads(CHECKPOINT.read_text())
    return {"lt_csvs_done": [], "lt_texts_done": [], "lv_pdfs_done": [], "ee_xmls_done": []}


def save_checkpoint(cp):
    CHECKPOINT.write_text(json.dumps(cp, ensure_ascii=False, indent=2))


# ============================================================
# LITHUANIA - LITEKO CSV + full text
# ============================================================

LT_CSV_URL = "https://liteko.teismai.lt/csv/viesi_sprendimai_{ym}.csv"
LT_TEXT_URL = "https://liteko.teismai.lt/viesasprendimupaieska/tekstas.aspx?id={doc_id}"

LT_MONTHS = []
for year in range(2023, 2027):
    for month in range(1, 13):
        if year == 2023 and month < 11:
            continue
        LT_MONTHS.append(f"{year}{month:02d}")


def download_lt_csvs():
    csv_dir = LT_DIR / "csv"
    csv_dir.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()
    done = set(cp.get("lt_csvs_done", []))

    print("=== Lithuania: downloading CSV metadata ===", flush=True)
    total = 0
    for ym in LT_MONTHS:
        if ym in done:
            continue
        url = LT_CSV_URL.format(ym=ym)
        try:
            r = SESSION.get(url, timeout=60)
            if r.status_code == 200 and len(r.content) > 100:
                out = csv_dir / f"viesi_sprendimai_{ym}.csv"
                out.write_bytes(r.content)
                cp["lt_csvs_done"].append(ym)
                save_checkpoint(cp)
                lines = r.text.count("\n")
                total += lines
                print(f"  {ym}: {lines} records ({len(r.content)/1024:.0f} KB)", flush=True)
            else:
                print(f"  {ym}: {r.status_code} (skipped)", flush=True)
        except Exception as e:
            print(f"  {ym}: error {e}", flush=True)

    print(f"  CSV done: {total} total records", flush=True)
    return total


def parse_lt_csvs():
    csv_dir = LT_DIR / "csv"
    items = []
    import csv
    for f in sorted(csv_dir.glob("*.csv")):
        with open(f, encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh, delimiter=";")
            for row in reader:
                doc_id = row.get("Dokumento_ID", "").strip()
                if doc_id:
                    items.append(row)
    return items


def fetch_lt_text(doc_id):
    url = LT_TEXT_URL.format(doc_id=doc_id)
    for attempt in range(5):
        try:
            r = SESSION.get(url, timeout=60)
            if r.status_code == 200 and len(r.text) > 500:
                text = re.sub(r"<[^>]+>", " ", r.text)
                text = re.sub(r"\s+", " ", text).strip()
                return doc_id, text
            time.sleep((attempt + 1) * 2)
        except Exception:
            time.sleep((attempt + 1) * 3)
    return doc_id, None


def download_lt_texts(workers=20):
    text_dir = LT_DIR / "texts"
    text_dir.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()
    done = set(cp.get("lt_texts_done", []))

    items = parse_lt_csvs()
    to_fetch = [row for row in items if row.get("Dokumento_ID", "").strip() not in done]
    print(f"\n=== Lithuania: fetching {len(to_fetch)} full texts ({len(done)} done) ===", flush=True)

    success = 0
    fail = 0
    batch = {}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_lt_text, row["Dokumento_ID"].strip()): row for row in to_fetch}
        for i, fut in enumerate(as_completed(futures)):
            doc_id, text = fut.result()
            if text:
                batch[doc_id] = text
                success += 1
                cp["lt_texts_done"].append(doc_id)
            else:
                fail += 1

            if len(batch) >= 1000:
                out_file = text_dir / f"batch_{success // 1000:04d}.jsonl"
                with open(out_file, "a", encoding="utf-8") as f:
                    for did, txt in batch.items():
                        f.write(json.dumps({"doc_id": did, "text": txt}, ensure_ascii=False) + "\n")
                batch = {}
                save_checkpoint(cp)

            if (i + 1) % 500 == 0:
                print(f"  [{i+1}/{len(to_fetch)}] {success} ok, {fail} fail", flush=True)

    if batch:
        out_file = text_dir / f"batch_final.jsonl"
        with open(out_file, "a", encoding="utf-8") as f:
            for did, txt in batch.items():
                f.write(json.dumps({"doc_id": did, "text": txt}, ensure_ascii=False) + "\n")
        save_checkpoint(cp)

    print(f"  Texts done: {success} ok, {fail} fail", flush=True)


def run_lithuania(workers=20):
    LT_DIR.mkdir(parents=True, exist_ok=True)
    download_lt_csvs()
    download_lt_texts(workers=workers)


# ============================================================
# LATVIA - PDF scraping by ID
# ============================================================

LV_PDF_URL = "https://manas.tiesas.lv/eTiesasMvc/nolemumi/pdf/{pdf_id}.pdf"
LV_MAX_ID = 520000


def download_lv_pdf(pdf_id, pdf_dir):
    out_path = pdf_dir / f"{pdf_id}.pdf"
    if out_path.exists() and out_path.stat().st_size > 500:
        return pdf_id, True

    url = LV_PDF_URL.format(pdf_id=pdf_id)
    for attempt in range(3):
        try:
            r = SESSION.get(url, timeout=30)
            if r.status_code == 200 and len(r.content) > 500 and b"%PDF" in r.content[:10]:
                out_path.write_bytes(r.content)
                return pdf_id, True
            if r.status_code == 404:
                return pdf_id, False
            time.sleep((attempt + 1) * 2)
        except Exception:
            time.sleep((attempt + 1) * 3)
    return pdf_id, False


def run_latvia(workers=20, start_id=1, end_id=LV_MAX_ID):
    pdf_dir = LV_DIR / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()
    done = set(cp.get("lv_pdfs_done", []))

    ids = [i for i in range(start_id, end_id + 1) if str(i) not in done]
    print(f"=== Latvia: downloading PDFs, IDs {start_id}-{end_id} ({len(ids)} to check, {len(done)} done) ===", flush=True)

    success = 0
    not_found = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(download_lv_pdf, pid, pdf_dir): pid for pid in ids}
        for i, fut in enumerate(as_completed(futures)):
            pid, ok = fut.result()
            if ok:
                success += 1
                cp["lv_pdfs_done"].append(str(pid))
            else:
                not_found += 1

            if (i + 1) % 5000 == 0:
                save_checkpoint(cp)
                print(f"  [{i+1}/{len(ids)}] {success} found, {not_found} not found", flush=True)

    save_checkpoint(cp)
    print(f"  Latvia done: {success} PDFs downloaded, {not_found} not found", flush=True)


# ============================================================
# ESTONIA - XML metadata + ECLI sitemaps
# ============================================================

EE_XML_FILES = [
    ("tsiviilasi.xml", "civil"),
    ("kriminaalasi.xml", "criminal"),
    ("haldusasi.xml", "administrative"),
    ("vaarteoasi.xml", "misdemeanor"),
    ("pohiseaduslikkuse_jarelevalve_asi.xml", "constitutional"),
]
EE_XML_URL = "https://avaandmed.rik.ee/andmed/KIS/Lahendid/{filename}"
EE_ECLI_URL = "https://avaandmed.rik.ee/andmed/ECLI/ecli/{year}/{month:02d}/{day:02d}/sitemap_001.xml"


def download_ee_xmls():
    xml_dir = EE_DIR / "xml"
    xml_dir.mkdir(parents=True, exist_ok=True)
    cp = load_checkpoint()
    done = set(cp.get("ee_xmls_done", []))

    print("=== Estonia: downloading XML metadata ===", flush=True)
    for filename, case_type in EE_XML_FILES:
        if filename in done:
            print(f"  {filename}: already done", flush=True)
            continue

        url = EE_XML_URL.format(filename=filename)
        try:
            r = SESSION.get(url, timeout=120, stream=True)
            r.raise_for_status()
            out = xml_dir / filename
            total = int(r.headers.get("content-length", 0))
            downloaded = 0
            with open(out, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
                    downloaded += len(chunk)
            cp["ee_xmls_done"].append(filename)
            save_checkpoint(cp)
            print(f"  {filename} ({case_type}): {downloaded / 1e6:.1f} MB", flush=True)
        except Exception as e:
            print(f"  {filename}: error {e}", flush=True)


def download_ee_ecli_sitemaps():
    ecli_dir = EE_DIR / "ecli"
    ecli_dir.mkdir(parents=True, exist_ok=True)

    print("\n=== Estonia: downloading ECLI sitemaps ===", flush=True)
    total_files = 0
    for year in [2017, 2018, 2021, 2022, 2023, 2024]:
        year_dir = ecli_dir / str(year)
        year_dir.mkdir(parents=True, exist_ok=True)

        for month in range(1, 13):
            for day in range(1, 32):
                url = EE_ECLI_URL.format(year=year, month=month, day=day)
                out = year_dir / f"{month:02d}_{day:02d}.xml"
                if out.exists():
                    continue
                try:
                    r = SESSION.get(url, timeout=30)
                    if r.status_code == 200 and len(r.content) > 200:
                        out.write_bytes(r.content)
                        total_files += 1
                except Exception:
                    pass

        print(f"  {year}: sitemaps collected", flush=True)

    print(f"  ECLI sitemaps done: {total_files} new files", flush=True)


def run_estonia():
    EE_DIR.mkdir(parents=True, exist_ok=True)
    download_ee_xmls()
    download_ee_ecli_sitemaps()


# ============================================================
# MAIN
# ============================================================

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "lt", "lithuania"):
        run_lithuania(workers=20)

    if mode in ("all", "lv", "latvia"):
        run_latvia(workers=20)

    if mode in ("all", "ee", "estonia"):
        run_estonia()

    print("\n=== All Baltic downloads done ===", flush=True)


if __name__ == "__main__":
    main()
