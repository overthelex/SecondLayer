#!/usr/bin/env python3
"""Decide whether the language criterion flips because the text varies or the judge does.

"Written in Ukrainian throughout" is a mechanical property. If it flips across trials, either
the deliverable really does contain English on some runs, or the judge is inconsistent about a
fact it can see. The two have opposite fixes: the first is a genuine finding about the model,
the second means the criterion belongs to the oracle and must never reach the judge at all.

Prints the judge's own reasoning on each verdict so the cause is read rather than assumed.
"""

import glob
import json
import os
import re

STAMP = re.compile(r"(20\d{6}-\d{6})")
WANT = "Written in Ukrainian"

seen = []
for path in glob.glob("results/**/scores.json", recursive=True):
    d = json.load(open(path, encoding="utf-8"))
    parts = os.path.normpath(path).split(os.sep)
    if any(p.startswith("redo6-") for p in parts):
        continue
    m = STAMP.search(path)
    if not m or not ("20260810-19" <= m.group(1)[:11] and m.group(1)[:13] <= "20260810-2159"):
        continue
    task = d.get("task", "").split("/")[-1]
    if task not in {"ua-agro-supply-v2", "ua-chemicals-permit-v2", "ua-it-address-v2",
                    "ua-transport-fleet-v2"}:
        continue
    for c in d["criteria_results"]:
        if WANT in c["title"]:
            seen.append((task, m.group(1), str(c["verdict"]).lower(),
                         " ".join(c.get("reasoning", "").split())))

for task, stamp, verdict, why in sorted(seen):
    print(f"{task:26s} {stamp}  {verdict.upper():5s}")
    print(f"    {why[:400]}")
    print()
