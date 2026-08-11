#!/usr/bin/env python3
"""Same as lit_refs, but matching the language the criteria are actually written in.

The first pass matched only Cyrillic "ст." and returned almost nothing, which is the shape of
a broken detector, not of a family with no statutory references: criteria carry
judge_language "en", so they say "Article 257" and "paragraph 19". Both forms are matched here,
and the raw counts of each form are printed so the detector can be judged rather than trusted.
"""

import collections
import glob
import json
import re

PATS = {
    "art_uk": re.compile(r"(?:ст\.?|статт[еія]{1,2})\s*(\d{2,4})"),
    "art_en": re.compile(r"[Aa]rt(?:icle|\.)?\s*(\d{2,4})"),
    "para_uk": re.compile(r"[Пп]\.?\s*(\d{1,2})\b"),
    "para_en": re.compile(r"[Pp]aragraph\s*(\d{1,2})\b"),
}
DATE = re.compile(r"\b(\d{2}\.\d{2}\.20\d{2})\b")

form = collections.Counter()
arts = collections.Counter()
paras = collections.Counter()
rows = []
for path in sorted(glob.glob("tasks/litigation-dispute-resolution/ua-*/task.json")):
    d = json.load(open(path, encoding="utf-8"))
    blob = json.dumps(d, ensure_ascii=False)
    tid = path.split("/")[-2]
    hits = {k: p.findall(blob) for k, p in PATS.items()}
    for k, v in hits.items():
        form[k] += len(v)
    a = sorted({int(x) for x in hits["art_uk"] + hits["art_en"]})
    p = sorted({int(x) for x in hits["para_uk"] + hits["para_en"]})
    arts.update(a)
    paras.update(p)
    dates = sorted(set(DATE.findall(blob)), key=lambda s: s[6:] + s[3:5] + s[:2])
    rows.append((tid, len(d["criteria"]), a, p, dates))

print("reference forms found across the family:", dict(form))
print()
for tid, n, a, p, dates in rows:
    span = f"{dates[0]}..{dates[-1]}" if dates else "-"
    print(f"  {tid:44s} crit {n:3d}  arts {a}  paras {p}  {span}")
print()
print("articles:", dict(sorted(arts.items())))
print("paragraphs:", dict(sorted(paras.items())))
