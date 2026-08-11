#!/usr/bin/env python3
"""Locate instability at the criterion, not the task.

A task-level range says a task is noisy but not why, and cannot be acted on. What can be acted
on is the individual criterion that passes on some trials and fails on others: either the
deliverable genuinely varies on that point, or the criterion is ambiguous and the judge is
coin-flipping. Either way it is the unit to rewrite.

Every criterion is classed always-pass / always-fail / FLIPPING across the trials available for
its task, using the per-criterion detail the judge already wrote to scores.json.
"""

import collections
import glob
import json
import os

by_crit = collections.defaultdict(list)
for path in glob.glob("results/**/scores.json", recursive=True):
    rid = path.split("/")[-2] if "/" in path else path
    parts = os.path.normpath(path).split(os.sep)
    rid = parts[-2] if len(parts) > 1 else path
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception:
        continue
    items = d.get("criteria_results") or []
    if isinstance(items, dict):
        items = list(items.values())
    for c in items:
        if not isinstance(c, dict):
            continue
        cid = c.get("id") or c.get("criterion_id") or c.get("title")
        v = c.get("verdict")
        passed = None if v is None else (str(v).lower() == "pass")
        if cid is None or passed is None:
            continue
        task = d.get("task") or rid
        by_crit[(task, cid, (c.get("title") or "")[:60])].append(bool(passed))

if not by_crit:
    print("no per-criterion detail found; scores.json shape:")
    for path in sorted(glob.glob("results/**/scores.json", recursive=True))[:1]:
        d = json.load(open(path, encoding="utf-8"))
        print(" keys:", list(d)[:12])
        print(" sample:", json.dumps(d, ensure_ascii=False)[:600])
    raise SystemExit

cls = collections.Counter()
flips = []
for (task, cid, title), vals in by_crit.items():
    if len(vals) < 3:
        continue
    if all(vals):
        cls["always pass"] += 1
    elif not any(vals):
        cls["always fail"] += 1
    else:
        cls["FLIPPING"] += 1
        flips.append((sum(vals), len(vals), task.split("/")[-1], cid, title))

print("criteria with >=3 trials:", sum(cls.values()), dict(cls))
bytitle = collections.Counter(t for _, _, _, _, t in flips)
print("\nwordings that flip in more than one task:")
for title, n in bytitle.most_common():
    if n > 1:
        print(f"  x{n}  {title}")
print("\nflipping criteria (passes/trials):")
for p, n, task, cid, title in sorted(flips, key=lambda r: -r[1]):
    print(f"  {p}/{n}  {task:42s} {cid:8s} {title}")
