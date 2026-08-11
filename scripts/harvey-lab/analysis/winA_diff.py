#!/usr/bin/env python3
"""Did the expiry criterion actually start rewarding the right answer?

The total is unchanged at 18/24, which on its own says nothing: the fix targeted one criterion,
and single runs on this pack move by a couple either way. What matters is whether C-011 flipped
and what took its place if the count held.
"""
import glob
import json


def load(rid):
    p = glob.glob(f"results/{rid}/**/scores.json", recursive=True) + \
        glob.glob(f"results/{rid}/scores.json")
    if not p:
        return {}
    d = json.load(open(p[0], encoding="utf-8"))
    return {c["id"]: (c["title"], str(c["verdict"]).lower() == "pass",
                      " ".join(c.get("reasoning", "").split())) for c in d["criteria_results"]}


before = load("lit2-litigation-dispute-resolution-ua-limitation-window-before-p19")
after = load("winA-after-254")
print(f"before {sum(v[1] for v in before.values())}/{len(before)}   "
      f"after {sum(v[1] for v in after.values())}/{len(after)}\n")

for cid in sorted(set(before) | set(after)):
    b = before.get(cid)
    a = after.get(cid)
    if not b or not a or b[1] == a[1]:
        continue
    print(f"  {cid}  {'FAIL->PASS' if a[1] else 'PASS->FAIL'}  {a[0][:66]}")
    if not a[1]:
        print(f"      {a[2][:260]}")

print("\nstill failing:")
for cid, (title, ok, why) in sorted(after.items()):
    if not ok:
        print(f"  {cid}  {title[:70]}")
