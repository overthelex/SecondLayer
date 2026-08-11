#!/usr/bin/env python3
"""Matter date and cited provisions for each litigation task, to size the extract they need.

Each task will get a document holding the text of the provisions its criteria turn on, taken
from several dated editions of the Civil Code. Which editions matter depends on the matter date,
so both are pulled here before anything is extracted.
"""

import glob
import json
import re

ART = re.compile(r"(?:статт[іяї]|Article)\s+(\d{1,4})")
PARA = re.compile(r"(?:пункт\w*\s+|paragraph\s+)(\d{1,2})\b")

for tj in sorted(glob.glob("tasks/litigation-dispute-resolution/ua-*/task.json")):
    d = json.load(open(tj, encoding="utf-8"))
    tid = tj.split("/")[2]
    blob = json.dumps(d["criteria"], ensure_ascii=False) + d["instructions"]
    arts = sorted({int(x) for x in ART.findall(blob)})
    paras = sorted({int(x) for x in PARA.findall(blob) if int(x) in (12, 19)})
    dates = sorted(set(re.findall(r"\b(\d{2}\.\d{2}\.20\d{2})\b", d["instructions"])),
                   key=lambda s: s[6:] + s[3:5] + s[:2])
    print(f"  {tid:44s} matter {dates[-1] if dates else '?'}  arts {arts}  paras {paras}")
