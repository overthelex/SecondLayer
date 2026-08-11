#!/usr/bin/env python3
"""How much parametric legal knowledge does an upstream task assume?

Our litigation family requires the model to recall the Ukrainian Civil Code: five of its nine
workspaces contain no statement of the rules the criteria turn on. Before calling that a defect,
the same question has to be asked of upstream, because if LAB routinely expects a model to know
the FRE or the DGCL then our family is in contract and merely harder.

For a sample of upstream tasks: pull every legal authority the criteria cite (statute, rule, code
section) and check whether that citation also appears somewhere in the task's own documents.
"""

import collections
import glob
import json
import os
import random
import re
import zipfile

CITE = re.compile(
    r"\b(?:FRE|FRCP|Rule|Section|§|U\.S\.C\.|USC|C\.F\.R\.|CFR|DGCL|UCC|Article)\s*"
    r"§?\s*(\d+[A-Za-z]?(?:\.\d+)?(?:\([a-z0-9]+\))*)", re.I)


def doc_text(path):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in (".docx", ".xlsx", ".pptx"):
            z = zipfile.ZipFile(path)
            return " ".join(re.sub(r"<[^>]+>", " ", z.read(n).decode("utf-8", "ignore"))
                            for n in z.namelist() if n.endswith(".xml"))
        return open(path, encoding="utf-8", errors="ignore").read()
    except Exception:
        return ""


tasks = [p for p in glob.glob("tasks/*/*/task.json") if "/ua-" not in p]
random.seed(5)
sample = random.sample(tasks, 60)

grounded = ungrounded = 0
per_task = []
for tj in sample:
    d = json.load(open(tj, encoding="utf-8"))
    if not d.get("work_type"):
        continue
    blob = json.dumps(d["criteria"], ensure_ascii=False)
    cites = set(CITE.findall(blob))
    if not cites:
        continue
    corpus = re.sub(r"\s+", " ", " ".join(
        doc_text(f) for f in glob.glob(os.path.dirname(tj) + "/documents/*")))
    miss = {c for c in cites if c not in corpus}
    grounded += len(cites) - len(miss)
    ungrounded += len(miss)
    per_task.append(("/".join(tj.split("/")[1:3]), len(cites), len(miss)))

print(f"upstream tasks sampled with legal citations in criteria: {len(per_task)}")
print(f"  citations that DO appear in the task's own documents: {grounded}")
print(f"  citations that do NOT: {ungrounded}")
if grounded + ungrounded:
    print(f"  grounded share: {100 * grounded / (grounded + ungrounded):.1f}%")

worst = sorted(per_task, key=lambda r: -r[2])[:6]
print("\ntasks leaning most on outside knowledge:")
for tid, n, m in worst:
    print(f"  {tid[:60]:60s} {m}/{n} citations absent from the workspace")
