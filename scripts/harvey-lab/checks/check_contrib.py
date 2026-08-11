#!/usr/bin/env python3
"""Check the pilot against CONTRIBUTING.md, and check CONTRIBUTING.md against the corpus.

The guide's example criterion carries a `sources` field that our tasks omit. Whether that is a
real defect depends on how upstream actually uses it, so the corpus is counted rather than the
guide taken at its word. The rest of the guide's rules are asserted against the pilot directly.
"""

import collections
import glob
import json
import os

tot = withsrc = 0
crit_tot = crit_src = 0
for p in glob.glob("tasks/*/*/task.json") + glob.glob("tasks/*/*/*/task.json"):
    if "/ua-" in p:
        continue
    d = json.load(open(p, encoding="utf-8"))
    tot += 1
    any_src = False
    for c in d.get("criteria", []):
        crit_tot += 1
        if c.get("sources"):
            crit_src += 1
            any_src = True
    withsrc += any_src
print(f"upstream tasks {tot}: {withsrc} ({100*withsrc/tot:.1f}%) have at least one criterion "
      f"with `sources`")
print(f"upstream criteria {crit_tot:,}: {crit_src:,} ({100*crit_src/crit_tot:.1f}%) carry `sources`")

keys = collections.Counter()
for p in glob.glob("tasks/*/*/task.json"):
    if "/ua-" in p:
        continue
    d = json.load(open(p, encoding="utf-8"))
    for c in d.get("criteria", []):
        keys.update(c.keys())
print("\ncriterion keys used upstream:", dict(keys.most_common()))

print("\n--- pilot against the guide ---")
p = "tasks/corporate-ma/ua-statut-tov-compliance-review/task.json"
d = json.load(open(p, encoding="utf-8"))
docs = set(os.listdir(os.path.dirname(p) + "/documents"))
checks = [
    ("work_type in the documented enum", d.get("work_type") in
     {"analyze", "draft", "review", "research"}),
    ("deliverables map present", bool(d.get("deliverables"))),
    ("language / jurisdiction / judge_language set", all(
        d.get(k) for k in ("language", "jurisdiction", "judge_language"))),
    ("no legacy weight field", not any("weight" in c for c in d["criteria"])),
    ("every criterion scoped to a real deliverable", all(
        set(c["deliverables"]) <= set(d["deliverables"]) for c in d["criteria"])),
    ("every criterion has PASS if and FAIL if", all(
        "PASS if" in c["match_criteria"] and "FAIL if" in c["match_criteria"]
        for c in d["criteria"])),
    ("criteria declare source expert/oracle", all(
        c.get("source") in {"expert", "oracle"} for c in d["criteria"])),
    ("criteria carry `sources`", all(c.get("sources") for c in d["criteria"])),
]
for label, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")

missing = [c["id"] for c in d["criteria"] if not c.get("sources")]
print(f"\ncriteria without `sources`: {len(missing)}/{len(d['criteria'])}")
print("documents available to cite:", sorted(docs))
