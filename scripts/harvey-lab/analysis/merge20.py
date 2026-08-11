#!/usr/bin/env python3
"""Fold the corrected six tasks back into the pack figure.

The other 17 tasks are unchanged, so their three trials from pack3.log stand. The six whose
repeal-date wording was corrected are replaced wholesale by redo6.log. Prints the before/after
for each of the six so the claim "the wording change moved nothing" is checkable rather than
asserted, then recomputes the pack and family aggregates from the merged set.
"""

import re
import statistics

ROW = re.compile(r"(\d)\t(\S+)\t\s*(\d+)/(\d+) criteria passed")
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


def load(path):
    by = {}
    for line in open(path, encoding="utf-8"):
        m = ROW.match(line)
        if m:
            by.setdefault(m.group(2), (int(m.group(4)), []))[1].append(int(m.group(3)))
    return by


old = load("pack3.log")
new = load("redo6.log")
new.update(load("redo14.log"))

merged = {}
for task, (n, scores) in old.items():
    short = task.split("/")[-1]
    merged[task] = (n, new[task][1] if short in REDONE and task in new else scores)

print("the 20 re-measured tasks, before -> after:")
moved = 0
for task in sorted(t for t in merged if t.split("/")[-1] in REDONE):
    n = merged[task][0]
    b, a = statistics.mean(old[task][1]), statistics.mean(merged[task][1])
    tag = ""
    if abs(a - b) > 0.001:
        moved += 1
        tag = f"   moved {a - b:+.2f}"
    print(f"  {task.split('/')[-1]:44s} {b:5.2f} -> {a:5.2f} /{n:<3d}"
          f"  spread {max(merged[task][1]) - min(merged[task][1])}{tag}")
print(f"\ntasks whose mean moved: {moved}/20")

print()
for fam, label in (("diligence", "diligence"), ("litigation", "litigation")):
    g = {k: v for k, v in merged.items() if k.startswith(fam)}
    mp = sum(statistics.mean(v[1]) for v in g.values())
    n = sum(v[0] for v in g.values())
    print(f"{label:11s} {len(g):2d} tasks  {mp:6.1f}/{n} = {100 * mp / n:.1f}%")

mp = sum(statistics.mean(v[1]) for v in merged.values())
n = sum(v[0] for v in merged.values())
ap = statistics.mean([sum(1 for k, v in merged.items() if v[1][i] == v[0]) for i in range(3)])
sp = [max(v[1]) - min(v[1]) for v in merged.values()]
print(f"\nPACK  {len(merged)} tasks  {mp:.1f}/{n} = {100 * mp / n:.1f}%   "
      f"all-pass {ap:.1f}/{len(merged)} = {100 * ap / len(merged):.1f}%")
print(f"per-task spread: mean {statistics.mean(sp):.2f}, max {max(sp)}, "
      f"zero {sum(1 for s in sp if s == 0)}/{len(sp)}")
