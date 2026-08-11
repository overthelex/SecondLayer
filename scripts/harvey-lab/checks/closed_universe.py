#!/usr/bin/env python3
"""Is every task answerable from its own workspace?

Harvey's CONTRIBUTING says "keep tasks self-contained"; Joel's notes call LAB "closed-universe"
twice and the sandbox runs with --network=none. A criterion that requires a provision of law the
workspace never supplies is therefore out of contract: it grades parametric recall, not the work.

For each task this asks whether the statutory provisions its criteria cite can be found in the
documents. It does not judge whether recall is a fair thing to test — only whether the task
keeps LAB's contract.
"""

import collections
import glob
import json
import os
import re
import zipfile

ART = re.compile(r"(?:статт[іяї]|Article)\s+(\d{1,4})")
PARA = re.compile(r"(?:пункт\w*|paragraph)\s+(\d{1,2})")


def read_docs(docdir):
    out = []
    for f in sorted(glob.glob(os.path.join(docdir, "*"))):
        ext = os.path.splitext(f)[1].lower()
        try:
            if ext in (".docx", ".xlsx", ".pptx"):
                z = zipfile.ZipFile(f)
                txt = " ".join(
                    re.sub(r"<[^>]+>", " ", z.read(n).decode("utf-8", "ignore"))
                    for n in z.namelist()
                    if n.endswith(".xml") and ("document" in n or "sheet" in n or "Strings" in n))
            else:
                txt = open(f, encoding="utf-8", errors="ignore").read()
        except Exception:
            txt = ""
        out.append((os.path.basename(f), re.sub(r"\s+", " ", txt)))
    return out


rows = []
for tj in sorted(glob.glob("tasks/*/ua-*/task.json")):
    d = json.load(open(tj, encoding="utf-8"))
    tid = "/".join(tj.split("/")[1:3])
    docs = read_docs(os.path.join(os.path.dirname(tj), "documents"))
    corpus = " ".join(t for _, t in docs)
    blob = json.dumps(d["criteria"], ensure_ascii=False)

    cited_arts = {int(x) for x in ART.findall(blob)}
    # Does the workspace contain the text of the statute at all?
    has_statute = any(n.startswith("zakon-") for n, _ in docs)
    # Which cited articles actually appear in the documents as article headings?
    present = {n for n in cited_arts if re.search(rf"[Сс]татт[яі]\s+{n}\b", corpus)}
    missing = sorted(cited_arts - present)
    rows.append((tid, len(docs), has_statute, sorted(cited_arts), missing))

print(f"{'task':52s} {'docs':>4} {'act?':>5}  cited articles not in the workspace")
selfcontained = 0
for tid, nd, has, cited, missing in rows:
    if not missing:
        selfcontained += 1
    flag = "" if not missing else "  <-- needs outside knowledge"
    print(f"  {tid[:50]:50s} {nd:>4} {'yes' if has else 'NO':>5}  {missing if missing else 'none'}{flag}")

print(f"\nself-contained: {selfcontained}/{len(rows)}")
fam = collections.Counter()
for tid, nd, has, cited, missing in rows:
    key = ("statute-review" if has else
           "litigation" if "limitation" in tid else "diligence")
    fam[(key, "ok" if not missing else "needs outside knowledge")] += 1
for k, v in sorted(fam.items()):
    print(f"  {k[0]:16s} {k[1]:24s} {v}")
