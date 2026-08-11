#!/usr/bin/env python3
"""Ask whether the decomposition bought resolution or just easier criteria.

Splitting one all-of-six criterion into six one-fact criteria raises the pooled rate
mechanically: a memo that gets five facts right scored 0/1 before and now scores 5/6. That is
more resolution if the sixth still fails, and pure inflation if all six always pass. The three
aborted runs are enough to tell which, per criterion group.
"""

import collections
import glob
import json

groups = collections.defaultdict(lambda: [0, 0])
fails = []
for path in glob.glob("results/pack4-*/**/scores.json", recursive=True):
    d = json.load(open(path, encoding="utf-8"))
    task = d["task"].split("/")[-1]
    for c in d["criteria_results"]:
        title = c["title"]
        prefix = title.split(":")[0] if ":" in title else "other"
        ok = str(c["verdict"]).lower() == "pass"
        g = groups[prefix]
        g[0] += ok
        g[1] += 1
        if not ok:
            fails.append((task, c["id"], title[:66]))

print(f"{'group':22s} {'passed':>10s}  rate")
for k, (p, n) in sorted(groups.items(), key=lambda kv: -kv[1][1]):
    print(f"  {k:20s} {p:4d}/{n:<4d}  {100 * p / n:5.1f}%")

print(f"\nfailures ({len(fails)}):")
for t, cid, title in sorted(fails):
    print(f"  {t:28s} {cid:7s} {title}")
