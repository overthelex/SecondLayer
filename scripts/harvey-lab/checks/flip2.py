#!/usr/bin/env python3
"""Criterion-level stability, restricted to runs made against the CURRENT task text.

The first attempt pooled every scores.json under results/ and produced denominators of 9, 11
and 12 for a three-trial experiment. That is not noise, it is version mixing: those runs were
judged against earlier revisions of the same tasks, before the vacuous-criteria rewrite, before
the paragraph-19 scoping fix and before the repeal-date correction. A criterion that "flips"
across revisions has simply been edited.

So runs are selected by wall-clock window instead. The three pack3 trials and the redo6 re-run
are the only rounds made against the committed text, and for the six corrected tasks only redo6
counts. The selection is asserted against the expected run counts before anything is reported.
"""

import collections
import glob
import json
import os
import re
import sys

PACK3_FROM, PACK3_TO = "20260810-19", "20260810-2159"   # the three pack3 trials
REDO6 = ("redo6-", "redo14-")
REDONE = {
    "ua-agro-supply-v2", "ua-chemicals-permit-v2", "ua-construction-capital-v2",
    "ua-counterparty-tax-v2", "ua-energy-tenders-v2", "ua-equipment-authority-v2",
    "ua-food-tax-v2", "ua-it-address-v2", "ua-logistics-nominee-v2",
    "ua-media-ownership-v2", "ua-metals-seizure-v2", "ua-pharma-sanctions-v2",
    "ua-retail-successor-v2", "ua-transport-fleet-v2",
    "ua-limitation-contractual-shortening-void",
    "ua-limitation-extended-by-agreement",
    "ua-limitation-not-raised-by-party",
    "ua-limitation-penalty-one-year",
    "ua-limitation-period-martial-law",
    "ua-limitation-quarantine-vs-martial-law",
}
STAMP = re.compile(r"(20\d{6}-\d{6})")

runs = collections.defaultdict(list)
for path in glob.glob("results/**/scores.json", recursive=True):
    d = json.load(open(path, encoding="utf-8"))
    task = d.get("task", "")
    short = task.split("/")[-1]
    parts = os.path.normpath(path).split(os.sep)
    is_redo = any(p.startswith(REDO6) for p in parts)
    m = STAMP.search(path)
    stamp = m.group(1) if m else ""
    if short in REDONE:
        keep = is_redo                      # corrected text lives only in the redo6 rounds
    else:
        keep = (not is_redo) and PACK3_FROM <= stamp[:11] and stamp[:13] <= PACK3_TO[:13]
    if keep:
        runs[task].append((stamp, d))

bad = {t: len(v) for t, v in runs.items() if len(v) != 3}
print(f"tasks selected: {len(runs)}   runs: {sum(len(v) for v in runs.values())}")
if bad or len(runs) != 23:
    print("SELECTION IS WRONG, refusing to report:", bad)
    sys.exit(1)

cls = collections.Counter()
flips = []
for task, entries in runs.items():
    per = collections.defaultdict(list)
    for _, d in entries:
        for c in d["criteria_results"]:
            per[(c["id"], c["title"])].append(str(c["verdict"]).lower() == "pass")
    for (cid, title), vals in per.items():
        if len(vals) != 3:
            continue
        if all(vals):
            cls["always pass"] += 1
        elif not any(vals):
            cls["always fail"] += 1
        else:
            cls["FLIPPING"] += 1
            flips.append((sum(vals), task.split("/")[-1], cid, title))

n = sum(cls.values())
print(f"\ncriteria instances, 3 trials each: {n}")
for k, v in cls.most_common():
    print(f"  {k:12s} {v:4d}  {100 * v / n:5.1f}%")

bytitle = collections.Counter(t for _, _, _, t in flips)
print("\nwordings unstable in more than one task:")
for title, k in bytitle.most_common():
    if k > 1:
        print(f"  x{k}  {title}")

print("\nall flipping criteria (passes/3):")
for p, task, cid, title in sorted(flips):
    print(f"  {p}/3  {task:42s} {cid:7s} {title[:60]}")
