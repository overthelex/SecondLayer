#!/usr/bin/env python3
"""Measure the law-grounding rate over the WHOLE upstream corpus, not a sample.

Two samples of the same quantity gave 92% and 78%, which is the sampling noise talking, and the
first of those also counted "Section 14.3" — a contract clause, not a legal authority, and
trivially present in the contract. A number that goes in a letter should not depend on the seed,
so this walks every graded upstream task and counts statutory citations only.
"""

import collections
import glob
import json
import os
import re
import zipfile

STATUTORY = re.compile(
    r"\b(?:FRE|FRCP|U\.?S\.?C\.?|C\.?F\.?R\.?|DGCL|UCC|HSR|ERISA|FLSA|GDPR|CCPA|"
    r"Securities Act|Exchange Act|Bankruptcy Code|Internal Revenue Code|IRC)\s*"
    r"§?\s*(\d+[A-Za-z]?(?:[.\-]\d+)*(?:\([a-z0-9]+\))*)", re.I)


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


grounded = missing = 0
ntasks = 0
examples = []
for tj in sorted(glob.glob("tasks/*/*/task.json")):
    if "/ua-" in tj:
        continue
    d = json.load(open(tj, encoding="utf-8"))
    if not d.get("work_type"):
        continue
    cites = set(STATUTORY.findall(json.dumps(d["criteria"], ensure_ascii=False)))
    if not cites:
        continue
    ntasks += 1
    corpus = re.sub(r"\s+", " ", " ".join(
        doc_text(f) for f in glob.glob(os.path.dirname(tj) + "/documents/*")))
    for c in cites:
        if c in corpus:
            grounded += 1
        else:
            missing += 1
            if len(examples) < 6:
                examples.append(("/".join(tj.split("/")[1:3]), c))

tot = grounded + missing
print(f"graded upstream tasks citing a statutory authority: {ntasks}")
print(f"citations: {tot}   grounded in the task's own documents: {grounded}"
      f" ({100 * grounded / tot:.0f}%)   absent: {missing}")
print("\nexamples of citations NOT in the workspace:")
for tid, c in examples:
    print(f"  {tid[:60]:60s} {c}")
