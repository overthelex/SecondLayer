#!/usr/bin/env python3
"""Do the litigation workspaces contain the RULES their criteria turn on, or only the numbers?

The first check asked whether a cited article number appears anywhere in the documents. It does —
the judgment cites Article 261 by number — so the check reported those tasks as fine. Citing a
number is not supplying a provision: the model still has to know what the provision says. This
looks for the operative words instead.
"""

import glob
import os
import re
import zipfile

RULES = {
    "art 257 — three-year general period": "три роки",
    "art 258 — one year for a penalty": "один рік",
    "art 259 — may be increased by agreement": "може бути збільшена",
    "para 12 — quarantine EXTENDS": "продовжуються",
    "para 19 — martial law SUSPENDS": "зупиняється",
}


def doc_text(path):
    try:
        z = zipfile.ZipFile(path)
        return re.sub(r"\s+", " ", " ".join(
            re.sub(r"<[^>]+>", " ", z.read(n).decode("utf-8", "ignore"))
            for n in z.namelist() if n.endswith(".xml")))
    except Exception:
        return ""


for tj in sorted(glob.glob("tasks/litigation-dispute-resolution/ua-*/task.json")):
    tid = tj.split("/")[2]
    corpus = " ".join(doc_text(f)
                      for f in glob.glob(os.path.dirname(tj) + "/documents/*"))
    found = [k for k, v in RULES.items() if v in corpus]
    print(f"  {tid[:48]:48s} {found if found else 'NO rule text in the workspace'}")
