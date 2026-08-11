#!/usr/bin/env python3
"""What still fails once the statute is in the workspace.

Before the extract these tasks graded recall: the model had to know which version of paragraph 19
applied. Now the text is in front of it, so a failure means it did not map the judgment date to
the right edition, or did not do the arithmetic. Those are different capabilities and the reasons
are worth reading rather than counting.
"""

import glob
import json

for rid_dir in sorted(glob.glob("results/lit2-*")):
    paths = glob.glob(f"{rid_dir}/**/scores.json", recursive=True) + \
            glob.glob(f"{rid_dir}/scores.json")
    if not paths:
        continue
    d = json.load(open(paths[0], encoding="utf-8"))
    print("=" * 96)
    print(f"{d['task'].split('/')[-1]}   {d['n_passed']}/{d['n_criteria']}")
    for c in d["criteria_results"]:
        if str(c["verdict"]).lower() == "pass":
            continue
        why = " ".join(c.get("reasoning", "").split())
        print(f"\n  {c['id']}  {c['title'][:78]}")
        print(f"      {why[:300]}")
