#!/usr/bin/env python3
"""Harvest DIFC Courts judgments & orders for a given year into JSONL.

Usage: harvest_difc.py <year> <out.jsonl>
Public source, no auth. One request at a time, polite delay.
"""
import hashlib
import html as htmlmod
import json
import re
import sys
import time

import requests

BASE = "https://www.difccourts.ae"
LIST = BASE + "/rules-decisions/judgments-orders"
UA = "Mozilla/5.0 (compatible; SecondLayer-research/1.0; +https://legal.org.ua)"

S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en"})

ROW = re.compile(
    r'<div class="each_result content_set">\s*<h4><a href="([^"]+)">(.*?)</a></h4>\s*'
    r'<p class="label_small">\s*(.*?)\s*</p>',
    re.S,
)
MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"])}

COURT_LEVEL = {
    "court of first instance": "first_instance",
    "court of appeal": "appeal",
    "arbitration": "arbitration",
    "small claims tribunal": "small_claims",
    "technology and construction division": "first_instance",
    "digital economy court": "first_instance",
}


def get(url, tries=4):
    for i in range(tries):
        try:
            r = S.get(url, timeout=60)
            if r.status_code == 200:
                return r.text
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(5 * (i + 1))
                continue
            sys.stderr.write("HTTP %s %s\n" % (r.status_code, url))
            return None
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("ERR %s %s\n" % (e, url))
            time.sleep(3 * (i + 1))
    return None


def strip_tags(fragment):
    f = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", fragment)
    f = re.sub(r"(?i)<br\s*/?>", "\n", f)
    f = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n\n", f)
    f = re.sub(r"(?i)</t[dh]>", "\t", f)
    f = re.sub(r"(?s)<[^>]+>", "", f)
    f = htmlmod.unescape(f)
    f = f.replace(" ", " ").replace("\x00", "")
    f = re.sub(r"[ \t]+", " ", f)
    f = re.sub(r"\n\s*\n\s*\n+", "\n\n", f)
    return f.strip()


def extract_body(page):
    """Return the judgment text container, honouring nested <div>s."""
    anchor = page.find('class="content_set_detail')
    if anchor == -1:
        anchor = 0
    start = page.find('<div class="content_desc"', anchor)
    if start == -1:
        return None
    i = page.find(">", start) + 1
    depth = 1
    pos = i
    for m in re.finditer(r"<(/?)div\b", page[i:]):
        depth += 1 if not m.group(1) else -1
        if depth == 0:
            pos = i + m.start()
            break
    else:
        pos = len(page)
    return page[i:pos]


def parse_label(label):
    """'July 14, 2026  Court of Appeal - Judgments' -> (date, court, type)."""
    label = re.sub(r"\s+", " ", strip_tags(label)).strip()
    m = re.match(r"([A-Z][a-z]+) (\d{1,2}), (\d{4})\s*(.*)$", label)
    if not m:
        return None, None, None
    d = "%04d-%02d-%02d" % (int(m.group(3)), MONTHS.get(m.group(1), 1), int(m.group(2)))
    rest = m.group(4).strip(" -")
    if " - " in rest:
        court, dtype = rest.split(" - ", 1)
    else:
        court, dtype = rest, None
    return d, court.strip() or None, (dtype or "").strip() or None


def parse_item(url, title_html, label_html):
    page = get(url)
    if page is None:
        return None
    body = extract_body(page)
    if body is None:
        return None
    text = strip_tags(body)
    if len(text) < 200:
        return None
    title = strip_tags(title_html)
    date, court, dtype = parse_label(label_html)

    cite = None
    mc = re.search(r"\[(20\d\d)\]\s*DIFC\s*([A-Z]{2,4})\s*(\d+)", title)
    if mc:
        cite = "[%s] DIFC %s %s" % (mc.group(1), mc.group(2), mc.group(3))
    case_no = None
    mn = re.search(r"Claim\s*No[.:]?\s*([A-Z]{2,5}[\s-]*\d+\s*/\s*\d{4})", text)
    if mn:
        case_no = re.sub(r"\s+", " ", mn.group(1)).strip()
    else:
        mt = re.match(r"([A-Z]{2,5}\s*\d+\s*/\s*\d{4})", title)
        if mt:
            case_no = re.sub(r"\s+", " ", mt.group(1)).strip()

    judges = re.findall(
        r"(?:H\.E\.\s+)?(?:DEPUTY\s+)?(?:CHIEF\s+)?JUSTICE\s+([A-Z][A-Z .'-]{3,60})", text)
    judges = sorted({re.sub(r"\s+", " ", j).strip(" .,") for j in judges})[:12]

    slug = url.rstrip("/").rsplit("/", 1)[-1]
    return {
        "doc_id": "difc:" + slug,
        "source": "difc",
        "jurisdiction": "DIFC",
        "court_name": court,
        "court_level": COURT_LEVEL.get((court or "").lower(), "other"),
        "case_number": case_no,
        "neutral_citation": cite,
        "case_title": title,
        "decision_date": date,
        "language": "en",
        "parties": title,
        "judges": judges,
        "decision_type": dtype,
        "full_text": text,
        "text_source": "html",
        "source_url": url,
        "pdf_url": None,
        "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "metadata_json": {"listing_label": re.sub(r"\s+", " ", strip_tags(label_html)),
                          "section": url.split("/")[-2] if "/" in url else None},
    }


def main():
    year = sys.argv[1]
    out = sys.argv[2]
    seen, written, page = set(), 0, 1
    with open(out, "w", encoding="utf-8") as fh:
        while True:
            url = "%s?year=%s&ccm_paging_p=%d&ccm_order_by=ak_date&ccm_order_by_direction=desc" % (
                LIST, year, page)
            listing = get(url)
            if listing is None:
                break
            rows = ROW.findall(listing)
            if not rows:
                break
            fresh = 0
            for item_url, title_html, label_html in rows:
                if not item_url.startswith("http"):
                    item_url = BASE + item_url
                if item_url in seen:
                    continue
                seen.add(item_url)
                fresh += 1
                rec = parse_item(item_url, title_html, label_html)
                if rec is None:
                    sys.stderr.write("SKIP %s\n" % item_url)
                    continue
                if rec["decision_date"] and not rec["decision_date"].startswith(str(year)):
                    continue
                line = json.dumps(rec, ensure_ascii=False)
                line = line.replace("\x01", " ").replace("\x02", " ")
                fh.write(line + "\n")
                written += 1
                time.sleep(0.4)
            sys.stderr.write("page %d: %d rows, %d new, total written %d\n"
                             % (page, len(rows), fresh, written))
            fh.flush()
            if fresh == 0:
                break
            page += 1
            time.sleep(0.6)
    sys.stderr.write("DONE year=%s written=%d unique_urls=%d\n" % (year, written, len(seen)))


if __name__ == "__main__":
    main()
