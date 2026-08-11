#!/usr/bin/env python3
"""Pick cheap upstream tasks for an end-to-end smoke on the schema-only branch.

The point of the smoke is to show the branch runs an unmodified upstream task through the
harness and the judge, so the tasks should be small: cost scales with workspace size and turn
count, and nothing about the schema change depends on the task being large.
"""

import glob
import json
import os

rows = []
for path in glob.glob("tasks/*/*/task.json"):
    d = json.load(open(path, encoding="utf-8"))
    if not d.get("work_type") or "/ua-" in path:
        continue
    docdir = os.path.join(os.path.dirname(path), "documents")
    ndocs = len(os.listdir(docdir)) if os.path.isdir(docdir) else 0
    rows.append((len(d["criteria"]), ndocs, "/".join(path.split("/")[1:3]), d["work_type"]))

rows.sort()
print("smallest upstream graded tasks:")
for crit, ndocs, tid, wt in rows[:10]:
    print(f"  {crit:3d} criteria  {ndocs:2d} docs  {wt:8s} {tid}")
