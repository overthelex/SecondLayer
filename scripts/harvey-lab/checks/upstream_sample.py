#!/usr/bin/env python3
"""Read how upstream reaches ~55 criteria on a task the size of ours.

Density does not scale with document count in LAB: the median is 56 criteria even at 1-3
documents. So the interesting question is what those criteria look like, because either they
are padded (in which case the target is not worth hitting) or they are finer-grained than ours
(in which case our 13.0 is a convention gap, not a content gap, and closing it costs little).
"""

import glob
import json
import os

cands = []
for p in glob.glob("tasks/*/*/task.json"):
    d = json.load(open(p, encoding="utf-8"))
    if not d.get("work_type") or "/ua-" in p:
        continue
    dd = os.path.join(os.path.dirname(p), "documents")
    n = len(os.listdir(dd)) if os.path.isdir(dd) else 0
    if 3 <= n <= 5 and 50 <= len(d["criteria"]) <= 60:
        cands.append((p, n, d))

path, n, d = sorted(cands)[0]
print(f"{path}   docs={n}  criteria={len(d['criteria'])}  deliverables={len(d['deliverables'])}")
print(f"instructions: {d['instructions'][:260]}\n")
for c in d["criteria"][:26]:
    print(f"  {c['id']}  {c['title'][:78]}")
print("\nexample match_criteria:")
for c in d["criteria"][:3]:
    print(f"  {c['id']}: {c['match_criteria'][:200]}")
