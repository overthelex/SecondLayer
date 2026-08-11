#!/usr/bin/env python3
"""List every statutory reference each litigation task depends on, with the matter date.

The diligence family is self-contained: its truth lives in the synthetic documents and has
already been recomputed from source. The litigation family is the only part that rests on
external law, so it is the only part where a wrong provision means a wrong task. This walks
the tasks so each reference can be checked against the edition in force on the matter date.
"""

import collections
import glob
import json
import re

ART = re.compile(r"(?:ст\.?|статт[еія]{1,2})\s*(\d{2,4})")
PARA = re.compile(r"[Пп]\.?\s*(\d{1,2})\s*(?:розділу|Прикінцев)")
DATE = re.compile(r"\b(\d{2}\.\d{2}\.20\d{2})\b")

rows = []
for path in sorted(glob.glob("tasks/litigation-dispute-resolution/ua-*/task.json")):
    d = json.load(open(path, encoding="utf-8"))
    blob = json.dumps(d, ensure_ascii=False)
    tid = path.split("/")[-2]
    arts = sorted({int(x) for x in ART.findall(blob)})
    paras = sorted({int(x) for x in PARA.findall(blob)})
    dates = sorted(set(DATE.findall(blob)), key=lambda s: s[6:] + s[3:5] + s[:2])
    rows.append((tid, len(d["criteria"]), arts, paras, dates))

print(f"litigation tasks: {len(rows)}")
allarts = collections.Counter()
for tid, n, arts, paras, dates in rows:
    allarts.update(arts)
    span = f"{dates[0]}..{dates[-1]}" if dates else "-"
    print(f"\n  {tid}")
    print(f"    criteria {n}  arts {arts}  paras {paras}")
    print(f"    dates {span}  ({len(dates)} distinct)")
print("\narticles across the family:", dict(sorted(allarts.items())))
