#!/usr/bin/env python3
"""Compare the pilot before and after the colliding clause was removed.

37/46 became 39/46. The interesting question is not the total but WHICH criteria moved: the fix
removed an ambiguity that could only have helped the model, so any criterion that newly passes
either was unfairly failed before, or moved for reasons unrelated to the fix and is just noise.
"""
import glob
import json

def load(rid):
    p = glob.glob(f"results/{rid}/**/scores.json", recursive=True)
    if not p:
        return {}
    d = json.load(open(p[0], encoding="utf-8"))
    return {c["id"]: (c["title"], str(c["verdict"]).lower() == "pass") for c in d["criteria_results"]}

a, b = load("smoke-statut-1"), load("smoke-statut-2")
if not a or not b:
    raise SystemExit("missing a run")
moved = [(cid, a[cid][0], a[cid][1], b[cid][1]) for cid in a if cid in b and a[cid][1] != b[cid][1]]
print(f"before {sum(v for _, v in a.values())}/{len(a)}   after {sum(v for _, v in b.values())}/{len(b)}")
print(f"criteria that changed verdict: {len(moved)}\n")
for cid, title, was, now in sorted(moved):
    print(f"  {cid}  {'FAIL->PASS' if now else 'PASS->FAIL'}  {title[:70]}")
print("\nstill failing after the fix:")
for cid, (title, ok) in sorted(b.items()):
    if not ok:
        print(f"  {cid}  {title[:74]}")
