#!/usr/bin/env python3
"""Prove the schema change leaves every existing task's description identical.

"All optional, defaults preserve behaviour" is the claim the PR rests on, and 21,766 passing
tests do not establish it: a test suite that never asserted on the new fields would pass either
way. The direct proof is that `describe_task` produces byte-identical output on the upstream
base and on the branch, for tasks sampled across every practice area.

Run twice — once per revision — then diff.
"""
import glob
import json
import random
import subprocess
import sys

rev = sys.argv[1]
tasks = sorted("/".join(p.split("/")[1:-1]) for p in glob.glob("tasks/*/*/task.json"))
random.seed(11)
by_area = {}
for t in tasks:
    by_area.setdefault(t.split("/")[0], []).append(t)
sample = [random.choice(v) for v in by_area.values()]           # one per practice area
sample += random.sample(tasks, min(40, len(tasks)))             # plus a spread
sample = sorted(set(sample))

out = {}
for t in sample:
    r = subprocess.run(["uv", "run", "python", "-m", "utils.describe_task", t],
                       capture_output=True, text=True)
    out[t] = r.stdout
json.dump(out, open(f"/tmp/describe-{rev}.json", "w"), ensure_ascii=False)
print(f"{rev}: described {len(out)} tasks across {len(by_area)} practice areas")
