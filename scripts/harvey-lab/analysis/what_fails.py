#!/usr/bin/env python3
"""Which criteria still fail on the valid run, and are they the discriminating ones?

A pack whose only failures are incidental is a pack that does not discriminate.
Group the surviving failures by criterion title to see whether difficulty is
concentrated in the jurisdiction-specific reasoning or scattered at random.
"""

import json
import glob
from pathlib import Path
from collections import Counter

MODEL = "sonnet-4-6"
fails, by_task, by_source = Counter(), {}, Counter()

# newest run per task only; older run dirs hold the void broken-sandbox scores
newest = {}
for f in glob.glob("results/**/scores.json", recursive=True):
    if MODEL not in f:
        continue
    d = json.load(open(f, encoding="utf-8"))
    t = d["task"]
    if t not in newest or Path(f).parent.name > Path(newest[t]).parent.name:
        newest[t] = f

for f in newest.values():
    d = json.load(open(f, encoding="utf-8"))
    task = d["task"]
    tj = f"tasks/{task}/task.json"
    try:
        cfg = json.load(open(tj, encoding="utf-8"))
    except FileNotFoundError:
        continue
    if cfg.get("jurisdiction") != "UA":
        continue
    src = {c["id"]: c.get("source", "expert") for c in cfg["criteria"]}
    missed = []
    for cr in d.get("criteria_results", []):
        ok = cr.get("passed") if "passed" in cr else (cr.get("verdict") == "pass")
        if not ok:
            title = cr.get("title") or cr.get("id")
            fails[title] += 1
            by_source[src.get(cr.get("id"), "?")] += 1
            missed.append(title)
    if missed:
        by_task[task] = missed

print("=== failing criteria, most common first ===")
for t, n in fails.most_common(20):
    print(f"  {n:2d}  {t[:88]}")
print(f"\ntotal failures: {sum(fails.values())}")
print("by criterion source:", dict(by_source))
print("\n=== per task ===")
for t, m in sorted(by_task.items()):
    print(f"  {t}")
    for x in m:
        print(f"       - {x[:84]}")
