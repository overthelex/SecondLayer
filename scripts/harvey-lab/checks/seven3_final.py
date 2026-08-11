#!/usr/bin/env python3
"""Final aggregate for the seven ported statute-review tasks, three trials each.

Before the port these seven passed 86 of 87 planted defects and the whole discriminating power
sat on one missing-clause criterion. Two ideas were carried over from the land-lease testbed —
more omissions, and a pair of clauses that contradict each other while each is lawful alone.
Reported per task with the spread, and per criterion kind, because a pooled figure alone would
not say whether the ideas transferred.
"""

import collections
import re
import statistics

rows = []
for line in open("../seven3.log", encoding="utf-8"):
    m = re.match(r"(\d)\t(\S+)\t\s*(\d+)/(\d+)", line)
    if m:
        rows.append((m.group(2).split("/")[-1], int(m.group(3)), int(m.group(4))))

by = collections.defaultdict(list)
for task, passed, total in rows:
    by[task].append(passed)

print(f"{'task':42s} {'runs':>5} {'mean of 3':>13} {'spread':>7}")
tot_p = tot_n = 0
for task, vals in sorted(by.items()):
    mean_p = statistics.mean(vals)
    n = next(t for k, p, t in rows if k == task)
    tot_p += mean_p
    tot_n += n
    print(f"  {task[:40]:40s} {len(vals):>5} {mean_p:6.1f}/{n:<4d} {100 * mean_p / n:5.1f}%"
          f" {max(vals) - min(vals):>6}")
print(f"\n  POOLED, mean of three trials: {tot_p:.1f}/{tot_n} = {100 * tot_p / tot_n:.1f}%")
