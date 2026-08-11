#!/usr/bin/env python3
"""Which of the four new defect kinds actually discriminated?

The total moved from 25/25-ish to 27/37, but a total says nothing about design. The question is
per kind: ordinary defects measured 104/106 across the pack before this, omissions 0/24, and the
old-style traps 16/16. If the new traps and the internal contradiction land anywhere between
those, the design change worked; if they sit at 100%, they are decoration.
"""

import collections
import glob
import json

KIND = [
    ("INTERNAL", lambda t: t.startswith("INTERNAL")),
    ("trap", lambda t: t.startswith("OVER-FLAGGING")),
    ("omission", lambda t: "(missing)" in t),
    ("defect", lambda t: t.startswith("ISSUE")),
    ("general", lambda t: True),
]

by = collections.defaultdict(lambda: [0, 0])
per = collections.defaultdict(list)
for rid in ("land3-t1", "land3-t2", "land3-t3"):
    paths = glob.glob(f"results/{rid}/**/scores.json", recursive=True) + \
            glob.glob(f"results/{rid}/scores.json")
    if not paths:
        continue
    d = json.load(open(paths[0], encoding="utf-8"))
    for c in d["criteria_results"]:
        t = c["title"]
        kind = next(k for k, f in KIND if f(t))
        ok = str(c["verdict"]).lower() == "pass"
        by[kind][0] += ok
        by[kind][1] += 1
        per[t].append(ok)

print(f"{'kind':12s} {'passed':>10}   rate")
for k, (p, n) in sorted(by.items(), key=lambda kv: kv[1][0] / max(1, kv[1][1])):
    print(f"  {k:10s} {p:4d}/{n:<4d} {100 * p / n:6.1f}%")

print("\nper criterion over the three trials:")
for t, vals in sorted(per.items(), key=lambda kv: sum(kv[1])):
    mark = "MISS" if sum(vals) == 0 else ("mixed" if sum(vals) < len(vals) else "")
    print(f"  {sum(vals)}/{len(vals)} {mark:5s} {t[:72]}")
