#!/usr/bin/env python3
"""Find what upstream criteria density actually scales with, instead of chasing a global median.

"Raise density from 13 to the upstream median of 54" treats 54 as a target, but LAB's median is
computed over tasks with far larger document sets than ours. Padding a small task to 54 is how
v1 died: 59% of its criteria never failed once. So the question is not "what is the median" but
"how many criteria does upstream write per unit of task size", and what that predicts for a task
the size of ours.

Reports density against document count and against deliverable count, for the tasks that carry a
work_type (the graded ones), so a defensible target can be read off the band our tasks fall in.
"""

import glob
import json
import os
import statistics

rows = []
for path in glob.glob("tasks/*/*/task.json"):
    d = json.load(open(path, encoding="utf-8"))
    if not d.get("work_type"):
        continue
    if "/ua-" in path:
        continue
    docdir = os.path.join(os.path.dirname(path), "documents")
    ndocs = len(os.listdir(docdir)) if os.path.isdir(docdir) else 0
    rows.append((ndocs, len(d.get("deliverables") or {}), len(d["criteria"])))

print(f"upstream graded tasks: {len(rows)}")
print(f"criteria: mean {statistics.mean(r[2] for r in rows):.1f}  "
      f"median {statistics.median(r[2] for r in rows):.0f}")
print(f"documents: median {statistics.median(r[0] for r in rows):.0f}")

print("\nby document count:")
buckets = [(1, 3), (4, 6), (7, 9), (10, 14), (15, 24), (25, 999)]
for lo, hi in buckets:
    g = [r[2] for r in rows if lo <= r[0] <= hi]
    if not g:
        continue
    print(f"  {lo:3d}-{hi:<3d} docs  n={len(g):4d}  criteria median {statistics.median(g):5.0f}"
          f"  mean {statistics.mean(g):6.1f}  q1 {statistics.quantiles(g, n=4)[0]:5.0f}"
          f"  q3 {statistics.quantiles(g, n=4)[2]:5.0f}")

print("\nby deliverable count:")
for k in sorted({r[1] for r in rows}):
    g = [r[2] for r in rows if r[1] == k]
    if len(g) < 20:
        continue
    print(f"  {k} deliverable(s)  n={len(g):4d}  criteria median {statistics.median(g):5.0f}")

percrit = [r[2] / r[0] for r in rows if r[0]]
print(f"\ncriteria per document: median {statistics.median(percrit):.1f}")
