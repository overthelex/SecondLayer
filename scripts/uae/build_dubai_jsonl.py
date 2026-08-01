#!/usr/bin/env python3
"""Join Dubai Courts index metadata with fetched full texts -> JSONL for ae_court_decisions.

Usage: build_dubai_jsonl.py <index_dir> <texts_dir> <out.jsonl>

index_dir : stage{S}_c*.json.gz  (rows: subtype/serial/case_year/decision_no/stage,
                                  case, registered, decided, days)
texts_dir : b*.json.gz           (items: same key fields + ok/chars/text)
"""
import glob
import gzip
import hashlib
import json
import os
import re
import sys

# Gregorian month names as Dubai Courts writes them, plus the spellings that vary
AR_MONTHS = {
    "يناير": 1, "كانون الثاني": 1,
    "فبراير": 2, "شباط": 2,
    "مارس": 3, "آذار": 3,
    "أبريل": 4, "ابريل": 4, "إبريل": 4, "نيسان": 4,
    "مايو": 5, "أيار": 5, "ايار": 5,
    "يونيو": 6, "يونية": 6, "حزيران": 6,
    "يوليو": 7, "يولية": 7, "تموز": 7,
    "أغسطس": 8, "اغسطس": 8, "آب": 8,
    "سبتمبر": 9, "أيلول": 9, "ايلول": 9,
    "أكتوبر": 10, "اكتوبر": 10, "تشرين الأول": 10,
    "نوفمبر": 11, "تشرين الثاني": 11,
    "ديسمبر": 12, "كانون الأول": 12,
}
# the portal also serves English month names on some pages
EN_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"])}
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

STAGE = {
    "1": ("محاكم دبي الابتدائية", "first_instance"),
    "3": ("محكمة الاستئناف", "appeal"),
    "5": ("محكمة التمييز", "cassation"),
    "7": ("اللجان القضائية الخاصة", "committee"),
}

VERDICT_URL = ("https://www.dc.gov.ae/PublicServices/VerdictPreview.aspx?"
               "OpenedPageNumber=0&Keyword=&CaseSubtypeCode=%(subtype)s&"
               "CaseSerialNumber=%(serial)s&OpenedCaseMainType=0&CaseYear=%(case_year)s&"
               "lang=&DecisionNumber=%(decision_no)s&OpenedLitigationStage=%(stage)s")


def ar_date(s):
    """'02 يناير 2011' -> '2011-01-02'. Returns None if unparseable."""
    if not s:
        return None
    s = s.translate(AR_DIGITS).strip()
    m = re.match(r"(\d{1,2})\s+(.+?)\s+(\d{4})$", s)
    if not m:
        return None
    name = m.group(2).strip()
    month = AR_MONTHS.get(name)
    if not month:
        month = EN_MONTHS.get(name[:3].lower())
    if not month:
        return None
    return "%s-%02d-%02d" % (m.group(3), month, int(m.group(1)))


def key(r):
    return (str(r["subtype"]), str(r["serial"]), str(r["case_year"]),
            str(r["decision_no"]), str(r["stage"]))


def case_type_label(case):
    """'455 / 2011 / 1 طعن عمالي' -> 'طعن عمالي'."""
    if not case:
        return None
    m = re.match(r"\s*[\d٠-٩]+\s*/\s*[\d٠-٩]+\s*/\s*[\d٠-٩]+\s*(.*)$", case)
    return (m.group(1).strip() or None) if m else None


def main():
    index_dir, texts_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    meta = {}
    for f in sorted(glob.glob(os.path.join(index_dir, "stage*_c*.json.gz"))):
        for r in json.loads(gzip.open(f).read()):
            meta[key(r)] = r
    sys.stderr.write("index rows: %d\n" % len(meta))

    written = no_meta = no_text = bad_date = 0
    with open(out, "w", encoding="utf-8") as fh:
        for f in sorted(glob.glob(os.path.join(texts_dir, "b*.json.gz"))):
            for it in json.loads(gzip.open(f).read()):
                if not it.get("ok") or not it.get("text"):
                    no_text += 1
                    continue
                k = key(it)
                m = meta.get(k)
                if m is None:
                    no_meta += 1
                    m = {}
                decided = ar_date(m.get("decided"))
                if m.get("decided") and not decided:
                    bad_date += 1
                stage = k[4]
                court_name, level = STAGE.get(stage, ("محاكم دبي", "other"))
                text = it["text"].replace("\x00", "")
                rec = {
                    "doc_id": "dubai:%s/%s/%s/%s/%s" % k,
                    "source": "dubai_courts",
                    "jurisdiction": "Dubai",
                    "court_name": court_name,
                    "court_level": level,
                    "case_number": m.get("case"),
                    "neutral_citation": None,
                    "case_title": m.get("case"),
                    "decision_date": decided,
                    "language": "ar",
                    "parties": None,
                    "judges": [],
                    "decision_type": case_type_label(m.get("case")),
                    "full_text": text,
                    "text_source": "html",
                    "source_url": VERDICT_URL % {"subtype": k[0], "serial": k[1],
                                                 "case_year": k[2], "decision_no": k[3],
                                                 "stage": k[4]},
                    "pdf_url": None,
                    "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "metadata_json": {
                        "registered_ar": m.get("registered"),
                        "registered": ar_date(m.get("registered")),
                        "decided_ar": m.get("decided"),
                        "duration_days": m.get("days"),
                        "case_subtype_code": k[0],
                        "litigation_stage_code": stage,
                    },
                }
                line = json.dumps(rec, ensure_ascii=False)
                fh.write(line.replace("\x01", " ").replace("\x02", " ") + "\n")
                written += 1
    sys.stderr.write("written=%d  no_text=%d  missing_metadata=%d  unparsed_dates=%d\n"
                     % (written, no_text, no_meta, bad_date))


if __name__ == "__main__":
    main()
