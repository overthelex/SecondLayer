#!/usr/bin/env python3
"""The omitted content must actually be absent from the draft.

Each task claims one mandatory item is missing, and that criterion is the only one discriminating
across all seven. If a filler clause happens to supply the same content, the criterion is not
merely easy, it is WRONG: the model would be marked down for reading the document correctly.

Checked by looking for the substantive words of the omitted item in the draft instrument.
"""

import glob
import json
import os
import re
import zipfile

# (task slug, words that would indicate the "missing" item is in fact present)
OMITTED = {
    "ua-dogovir-orendy-zemli-review": ["відповідальн", "несплат", "пеня", "штраф"],
    "ua-polityka-personalnyh-danyh-review": ["треті", "третім особам", "передаються", "передач"],
    "ua-polozhennya-ohorona-praci-review": ["під розписку", "поінформувати", "ознайомл"],
    "ua-ipotechnyi-dogovir-review": ["опис предмета іпотеки", "ідентифікац", "реєстраційний номер об"],
    "ua-spozhyvchyi-dogovir-review": ["ціна", "вартість товару", "правила придбання"],
    "ua-tenderna-dokumentaciya-review": ["інструкц", "підготовк", "оформлення пропозиц"],
    "ua-statut-tov-compliance-review": ["обліков", "депозитар", "облік часток"],
}


def paras(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8", "ignore")
    out = []
    for chunk in xml.split("</w:p>"):
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", chunk)).strip()
        if t:
            out.append(t)
    return out


hits = 0
for tj in sorted(glob.glob("tasks/*/ua-*-review/task.json")):
    slug = tj.split("/")[2]
    if slug not in OMITTED:
        continue
    docdir = os.path.dirname(tj) + "/documents"
    draft = [f for f in glob.glob(docdir + "/*") if os.path.basename(f).startswith("proyekt-")]
    if not draft:
        print(f"  {slug}: no draft document")
        continue
    ps = paras(draft[0])
    found = []
    for p in ps:
        low = p.lower()
        for w in OMITTED[slug]:
            if w.lower() in low:
                found.append((w, p[:120]))
    print(f"  {slug}")
    if found:
        hits += 1
        for w, p in found[:4]:
            print(f"      PRESENT '{w}' -> {p}")
    else:
        print("      absent, as the criterion claims")
print(f"\n{hits} task(s) where the supposedly missing content appears in the draft")
