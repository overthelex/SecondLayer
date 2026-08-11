#!/usr/bin/env python3
"""Aggregate the seven ported tasks, and say what the two ported ideas actually bought.

Before the port these seven ran at 86/87 on planted defects with the whole discriminating power
resting on a single missing-clause criterion. The question is not whether the totals moved but
whether the two ideas carried over — more omissions, and a pair of clauses that contradict each
other — behave the way they did on the testbed.
"""

import collections
import glob
import json
import re
import statistics

rows = []
for line in open("seven3.log", encoding="utf-8"):
    m = re.match(r"(\d)\t(\S+)\t\s*(\d+)/(\d+)", line)
    if m:
        rows.append((int(m.group(1)), m.group(2).split("/")[-1],
                     int(m.group(3)), int(m.group(4))))

by = collections.defaultdict(list)
for trial, task, passed, total in rows:
    by[task].append((passed, total))

print(f"{'task':44s} {'runs':>5}  mean")
tot_p = tot_n = 0
for task, vals in sorted(by.items()):
    mean_p = statistics.mean(v[0] for v in vals)
    n = vals[0][1]
    tot_p += mean_p
    tot_n += n
    print(f"  {task[:42]:42s} {len(vals):>5}  {mean_p:5.1f}/{n:<3d} {100 * mean_p / n:5.1f}%")
print(f"\n  pooled: {tot_p:.1f}/{tot_n} = {100 * tot_p / tot_n:.1f}%   "
      f"(these seven were 86/87 = 98.9% on planted defects before the port)")

# by criterion kind, over every completed run
KIND = [("INTERNAL", lambda t: t.startswith("INTERNAL")),
        ("trap", lambda t: t.startswith("OVER-FLAGGING")),
        ("omission", lambda t: "(missing)" in t),
        ("defect", lambda t: t.startswith("ISSUE")),
        ("general", lambda t: True)]
kinds = collections.defaultdict(lambda: [0, 0])
for path in glob.glob("../harvey-labs/results/seven3-*/**/scores.json", recursive=True) + \
            glob.glob("../harvey-labs/results/seven3-*/scores.json") + \
            glob.glob("results/seven3-*/**/scores.json", recursive=True) + \
            glob.glob("results/seven3-*/scores.json"):
    d = json.load(open(path, encoding="utf-8"))
    for c in d["criteria_results"]:
        k = next(name for name, f in KIND if f(c["title"]))
        kinds[k][0] += str(c["verdict"]).lower() == "pass"
        kinds[k][1] += 1

if kinds:
    print(f"\n{'kind':12s} {'passed':>10}   rate")
    for k, (p, n) in sorted(kinds.items(), key=lambda kv: kv[1][0] / max(1, kv[1][1])):
        print(f"  {k:10s} {p:4d}/{n:<4d} {100 * p / n:6.1f}%")
