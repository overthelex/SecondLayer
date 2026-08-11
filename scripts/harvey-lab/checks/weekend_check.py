#!/usr/bin/env python3
"""Does any date a criterion demands fall on a weekend?

The model computed the unextended expiry as 14.02.2022 and cited Article 254 — the rule that
moves a deadline falling on a non-working day to the next working day. 13.02.2022, which the
criterion demands, was a Sunday. The model applied Ukrainian law correctly and the task marked it
wrong, which is the third time this family has graded my arithmetic rather than the model's work.

Checks every date the criteria require, and prints the text of Article 254 so the rule is read
rather than recalled.
"""

import datetime
import glob
import json
import re

DATE = re.compile(r"\b(\d{2})\.(\d{2})\.(20\d{2})\b")
DEMAND = re.compile(r"(?:would run out on|expiry date as|спливає|run out on)\s*(\d{2}\.\d{2}\.20\d{2})")

print("=== dates demanded by criteria, with weekday")
for tj in sorted(glob.glob("tasks/litigation-dispute-resolution/ua-*/task.json")):
    d = json.load(open(tj, encoding="utf-8"))
    tid = tj.split("/")[2]
    for c in d["criteria"]:
        mc = c["match_criteria"]
        if "run out" not in mc and "expiry" not in mc.lower():
            continue
        for dd, mm, yy in DATE.findall(mc):
            day = datetime.date(int(yy), int(mm), int(dd))
            wd = day.strftime("%A")
            flag = "  <-- WEEKEND" if day.weekday() >= 5 else ""
            print(f"  {tid[:44]:44s} {c['id']}  {dd}.{mm}.{yy} is a {wd}{flag}")

print("\n=== Article 254 of the Civil Code, as harvested")
prov = json.load(open("/tmp/ck_provisions.json", encoding="utf-8"))
ed = "20250110"
art = prov.get(ed, {}).get("articles", {}).get("254")
print(art[:600] if art else "  Article 254 was not extracted — it is not in the pulled set")
