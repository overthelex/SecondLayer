#!/usr/bin/env python3
"""Count criterion outcomes by kind, once per file.

The previous pass reported 1,636 criteria instances across 14 runs of ~29 criteria each, which is
four times too many: `results/x/**/scores.json` with recursive=True already matches the top-level
file, and a second pattern matched it again. Rates survived that because every file was
over-counted equally, but the absolute numbers were nonsense. Paths are deduplicated here.
"""

import collections
import glob
import json
import os

KIND = [("INTERNAL", lambda t: t.startswith("INTERNAL")),
        ("trap", lambda t: t.startswith("OVER-FLAGGING")),
        ("omission", lambda t: "(missing)" in t),
        ("defect", lambda t: t.startswith("ISSUE")),
        ("general", lambda t: True)]

files = {os.path.realpath(p)
         for p in glob.glob("results/seven3-*/**/scores.json", recursive=True)}
print(f"distinct score files: {len(files)}")

kinds = collections.defaultdict(lambda: [0, 0])
for path in files:
    d = json.load(open(path, encoding="utf-8"))
    for c in d["criteria_results"]:
        name = next(n for n, f in KIND if f(c["title"]))
        kinds[name][0] += str(c["verdict"]).lower() == "pass"
        kinds[name][1] += 1

total = sum(v[1] for v in kinds.values())
print(f"criteria instances: {total}   ({total / max(1, len(files)):.0f} per run)\n")
print(f"{'kind':12s} {'passed':>10}   rate")
for name, (p, t) in sorted(kinds.items(), key=lambda kv: kv[1][0] / max(1, kv[1][1])):
    print(f"  {name:10s} {p:4d}/{t:<4d} {100 * p / t:6.1f}%")
