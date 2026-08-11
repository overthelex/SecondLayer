#!/usr/bin/env python3
"""Extract the acts the new review tasks will sit on, one JSON per act.

Editions matter: the register carries future-dated editions (ліцензування is dated 20290702),
so the edition in force on the matter date is chosen explicitly rather than by taking the last
one. Each act is stored with its articles split out so provisions can be quoted exactly.
"""

import glob
import json
import re

ACTS = {
    "161-14": "Про оренду землі",
    "898-15": "Про іпотеку",
    "1023-12": "Про захист прав споживачів",
    "157-20": "Про оренду державного та комунального майна",
    "2297-17": "Про захист персональних даних",
    "2694-12": "Про охорону праці",
    "222-19": "Про ліцензування видів господарської діяльності",
    "922-19": "Про публічні закупівлі",
}
CUTOFF = "20260811"          # nothing dated after today may be treated as in force
CH = re.compile(r"(Друкувати|Допомога|Шрифт:|\+ збільшити|− зменшити|Ctrl \+ mouse wheel)")

eds = {k: {} for k in ACTS}
for f in glob.glob("/data/rada_npa/texts/*/shard_*.ndjson"):
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            for nreg in ACTS:
                if '"%s"' % nreg not in line:
                    continue
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if r.get("nreg") != nreg or r.get("http_status") != 200 or not r.get("text"):
                    continue
                eds[nreg][r["ed_date"]] = re.sub(r"[ \t]+", " ", CH.sub("", r["text"]))

out = {}
for nreg, name in ACTS.items():
    dated = sorted(d for d in eds[nreg] if d <= CUTOFF)
    if not dated:
        print(f"  {nreg}: NO edition at or before {CUTOFF}")
        continue
    ed = dated[-1]
    text = eds[nreg][ed]
    arts = []
    for p in re.split(r"(?=Стаття\s+\d+)", text):
        m = re.match(r"Стаття\s+(\d+)[\.\s]*([^\n]*)", p)
        if m:
            arts.append({"n": int(m.group(1)), "title": m.group(2).strip()[:80],
                         "words": len(p.split()), "text": p.strip()})
    out[nreg] = {"nreg": nreg, "name": name, "ed_date": ed, "text": text, "articles": arts}
    future = [d for d in eds[nreg] if d > CUTOFF]
    print(f"  {nreg:9s} ed {ed}  {len(text.split()):6,} words  {len(arts):3d} articles"
          f"{'   (ignored %d future editions)' % len(future) if future else ''}  {name}")

json.dump(out, open("/tmp/acts.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"\nwritten: {len(out)} acts")
