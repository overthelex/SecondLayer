#!/usr/bin/env python3
"""Harvest ADGM Courts judgments (PDF) for a given year into JSONL.

Usage: harvest_adgm.py <year> <out.jsonl>
Text is extracted with pdftotext -layout (poppler).
"""
import hashlib
import html as htmlmod
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import requests

LIST = "https://www.adgm.com/adgm-courts/judgments"
UA = "Mozilla/5.0 (compatible; SecondLayer-research/1.0; +https://legal.org.ua)"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en"})

MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def clean(fragment):
    if fragment is None:
        return None
    t = re.sub(r"(?s)<[^>]+>", " ", fragment)
    t = htmlmod.unescape(t)
    return re.sub(r"\s+", " ", t).strip() or None


def cell(row, cid):
    m = re.search(r'<adgm-table-cell id="%s">(.*?)</adgm-table-cell>' % cid, row, re.S)
    return clean(m.group(1)) if m else None


def get(url, tries=4, binary=False):
    for i in range(tries):
        try:
            r = S.get(url, timeout=90)
            if r.status_code == 200:
                return r.content if binary else r.text
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(5 * (i + 1))
                continue
            sys.stderr.write("HTTP %s %s\n" % (r.status_code, url))
            return None
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("ERR %s %s\n" % (e, url))
            time.sleep(3 * (i + 1))
    return None


def pdf_text(blob):
    fd, path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(blob)
        out = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
                             capture_output=True, timeout=180)
        txt = out.stdout.decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("PDFERR %s\n" % e)
        return None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    txt = txt.replace("\x00", "").replace("\x01", " ").replace("\x02", " ")
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n\s*\n\s*\n+", "\n\n", txt)
    return txt.strip()


def court_of(case_number, citation):
    src = "%s %s" % (case_number or "", citation or "")
    if "CFI" in src:
        return "ADGM Court of First Instance", "first_instance"
    if "CA" in src.split():
        return "ADGM Court of Appeal", "appeal"
    return "ADGM Courts", "other"


def main():
    year = sys.argv[1]
    out = sys.argv[2]
    written, page, stop = 0, 1, False
    with open(out, "w", encoding="utf-8") as fh:
        while not stop and page <= 60:
            listing = get("%s?psize=50&page=%d" % (LIST, page))
            if listing is None:
                break
            rows = re.findall(r"<adgm-table-row>(.*?)</adgm-table-row>", listing, re.S)
            if not rows:
                break
            older = 0
            for row in rows:
                date_s = cell(row, "date")
                if not date_s:
                    continue
                m = re.match(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})", date_s)
                if not m:
                    continue
                y = m.group(3)
                if year != "all" and y != str(year):
                    older += 1
                    continue
                date = "%s-%02d-%02d" % (y, MONTHS.get(m.group(2)[:3], 1), int(m.group(1)))
                case_number = cell(row, "caseNumber")
                case_name = cell(row, "caseName")
                link = re.search(r'href="([^"]+)"', row)
                pdf_url = htmlmod.unescape(link.group(1)) if link else None
                citation = None
                cm = re.search(r'href="[^"]+"[^>]*>(.*?)</a>', row, re.S)
                if cm:
                    citation = clean(cm.group(1))
                text = None
                if pdf_url:
                    blob = get(pdf_url, binary=True)
                    if blob:
                        text = pdf_text(blob)
                    time.sleep(0.5)
                if not text or len(text) < 200:
                    sys.stderr.write("SKIP no text %s %s\n" % (case_number, pdf_url))
                    continue
                court_name, level = court_of(case_number, citation)
                doc_id = "adgm:" + re.sub(r"[^A-Za-z0-9_-]+", "-",
                                          (citation or "%s-%s" % (case_number, date))).strip("-")
                rec = {
                    "doc_id": doc_id,
                    "source": "adgm",
                    "jurisdiction": "ADGM",
                    "court_name": court_name,
                    "court_level": level,
                    "case_number": case_number,
                    "neutral_citation": citation,
                    "case_title": case_name,
                    "decision_date": date,
                    "language": "en",
                    "parties": case_name,
                    "judges": [],
                    "decision_type": "Judgment",
                    "full_text": text,
                    "text_source": "pdf",
                    "source_url": LIST,
                    "pdf_url": pdf_url,
                    "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "metadata_json": {"listing_date": date_s, "summary": cell(row, "summary")},
                }
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                written += 1
            fh.flush()
            sys.stderr.write("page %d: %d rows, %d off-year, written %d\n"
                             % (page, len(rows), older, written))
            if year != "all" and older > len(rows) * 0.8:
                stop = True
            page += 1
            time.sleep(0.8)
    sys.stderr.write("DONE year=%s written=%d\n" % (year, written))


if __name__ == "__main__":
    main()
