#!/usr/bin/env python3
"""Re-check findings 3 and 4 before they go in a letter.

Finding 3 says criteria density "tracks words". What was actually measured is that density is
flat across DOCUMENT counts and that upstream workspaces are ~100x larger than mine in words.
Neither establishes that criteria count rises with words inside upstream. If the correlation is
weak, the claim has to be restated as the size gap it really is.

Finding 4 says 92% of cited legal authorities appear in the task's own documents. The pattern
that produced it matched "Section 14.3" and "Article 5" as well as "FRE 502(d)" — and a contract
clause reference trivially appears in the contract. That would inflate the figure with exactly
the citations the claim is not about. Statutory-only citations are counted separately here.
"""

import glob
import json
import os
import random
import re
import statistics
import zipfile

STATUTORY = re.compile(
    r"\b(?:FRE|FRCP|U\.?S\.?C\.?|C\.?F\.?R\.?|DGCL|UCC|HSR|ERISA|FLSA|GDPR|CCPA|"
    r"Securities Act|Exchange Act|Bankruptcy Code|Internal Revenue Code|IRC)\s*"
    r"§?\s*(\d+[A-Za-z]?(?:[.\-]\d+)*(?:\([a-z0-9]+\))*)", re.I)
LOOSE = re.compile(
    r"\b(?:Section|Article|Rule|§)\s*§?\s*(\d+[A-Za-z]?(?:\.\d+)*(?:\([a-z0-9]+\))*)", re.I)


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

# ---- finding 3: does criteria count rise with workspace words? ----
def words_of(tj):
    return sum(len(doc_text(f).split())
               for f in glob.glob(os.path.dirname(tj) + "/documents/*"))


sample3 = random.sample(tasks, 120)
pairs = []
for tj in sample3:
    d = json.load(open(tj, encoding="utf-8"))
    if not d.get("work_type"):
        continue
    w = words_of(tj)
    if w:
        pairs.append((w, len(d["criteria"])))

if len(pairs) > 10:
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    r = statistics.correlation(xs, ys)
    rank = statistics.correlation(
        [sorted(xs).index(x) for x in xs], [sorted(ys).index(y) for y in ys])
    print(f"finding 3 — upstream tasks sampled: {len(pairs)}")
    print(f"  workspace words: median {statistics.median(xs):,.0f}")
    print(f"  criteria:        median {statistics.median(ys):,.0f}")
    print(f"  Pearson r(words, criteria) = {r:+.2f}")
    print(f"  Spearman-ish rank r        = {rank:+.2f}")
    for lo, hi in ((0, 10000), (10000, 25000), (25000, 50000), (50000, 10**9)):
        g = [y for x, y in pairs if lo <= x < hi]
        if len(g) >= 5:
            print(f"    {lo:6,}-{hi:<9,} words  n={len(g):3d}  criteria median {statistics.median(g):5.0f}")

# ---- finding 4: statutory citations only ----
print("\nfinding 4 — citations grounded in the task's own documents")
for label, pattern in (("statutory only (FRE, U.S.C., DGCL, …)", STATUTORY),
                       ("loose (also Section/Article/Rule N)", LOOSE)):
    grounded = missing = 0
    ntasks = 0
    for tj in random.sample(tasks, 60):
        d = json.load(open(tj, encoding="utf-8"))
        blob = json.dumps(d.get("criteria", []), ensure_ascii=False)
        cites = set(pattern.findall(blob))
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
    tot = grounded + missing
    print(f"  {label}: {ntasks} tasks, {grounded}/{tot} grounded"
          f" ({100 * grounded / tot:.0f}%)" if tot else f"  {label}: no citations found")
