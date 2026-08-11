#!/usr/bin/env python3
"""Find every place 14.05.2025 is used, and say whether it is used as a text-change date.

Window D had to be rebuilt because it treated the date of Law 4434-IX (14.05.2025) as the date
paragraph 19 left the Civil Code, when the text in fact still carried it on 28.08.2025. Six
other tasks in the family also end on 14.05.2025. If any of them asserts that limitation
resumed running on that date, it repeats the same defect and must be repaired the same way.

Prints the surrounding sentence for each occurrence so the use can be judged, not guessed.
"""

import glob
import json
import re

NEEDLE = "14.05.2025"
RESUMED = re.compile(
    r"(resum|ceas|repeal|no longer|expir|end(?:ed|s)?|until|stopped|lifted)", re.I
)

for path in sorted(glob.glob("tasks/litigation-dispute-resolution/ua-*/task.json")):
    d = json.load(open(path, encoding="utf-8"))
    tid = path.split("/")[-2]
    hits = []

    def walk(node, trail):
        if isinstance(node, str):
            if NEEDLE in node:
                hits.append((trail, node))
        elif isinstance(node, dict):
            for k, v in node.items():
                walk(v, f"{trail}.{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{trail}[{i}]")

    walk(d, "")
    if not hits:
        continue
    print("=" * 96)
    print(tid)
    for trail, text in hits:
        for sent in re.split(r"(?<=[.;])\s+", text):
            if NEEDLE not in sent:
                continue
            flag = "  <-- CHECK" if RESUMED.search(sent) else ""
            print(f"  {trail}{flag}")
            print(f"    {sent.strip()[:330]}")
