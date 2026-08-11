#!/usr/bin/env python3
"""Pull the limitation provisions of the Civil Code across editions.

The litigation tasks grade recall today: five of nine workspaces contain no statement of the
rules their criteria turn on. The fix is to put the provisions in the workspace — but supplying
only the edition in force on the matter date would turn a temporal task into a reading task, so
several dated editions go in and the analysis has to pick.

Extracted per edition: articles 257, 258, 259, 261, 267 and 625, and paragraphs 12 and 19 of the
Final and Transitional Provisions, which is where the martial-law and quarantine rules live.
"""

import glob
import json
import re

NREG = "435-15"
ARTS = [253, 254, 257, 258, 259, 261, 267, 625]
CH = re.compile(r"(Друкувати|Допомога|Шрифт:|\+ збільшити|− зменшити|Ctrl \+ mouse wheel)")
NOTE = re.compile(r"\{[^{}]*\}")          # {Стаття 11 із змінами, внесеними …} editorial notes


def clean(t):
    return re.sub(r"[ \t]+", " ", CH.sub("", t))


def article(text, n):
    """Text of one article, from its heading to the next article heading."""
    m = re.search(rf"Стаття\s+{n}\.\s", text)
    if not m:
        return None
    rest = text[m.start():]
    nxt = re.search(r"\nСтаття\s+\d+[\.\s]", rest[10:])
    body = rest[: 10 + nxt.start()] if nxt else rest[:4000]
    return re.sub(r"\n{2,}", "\n", NOTE.sub("", body)).strip()


def transitional(text, n):
    """Paragraph n of the Final and Transitional Provisions, if present."""
    i = text.find("ПРИКІНЦЕВІ ТА ПЕРЕХІДНІ ПОЛОЖЕННЯ")
    if i < 0:
        return None
    block = text[i:]
    m = re.search(rf"(?:^|\n)\s*{n}\.\s+", block)
    if not m:
        return None
    rest = block[m.start():]
    nxt = re.search(rf"(?:^|\n)\s*{n + 1}\.\s+", rest[5:])
    body = rest[: 5 + nxt.start()] if nxt else rest[:3000]
    return re.sub(r"\n{2,}", "\n", NOTE.sub("", body)).strip()


eds = {}
for f in glob.glob("/data/rada_npa/texts/*/shard_*.ndjson"):
    with open(f, encoding="utf-8") as fh:
        for line in fh:
            if '"%s"' % NREG not in line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("nreg") == NREG and r.get("http_status") == 200 and r.get("text"):
                eds[r["ed_date"]] = clean(r["text"])

out = {}
for ed in sorted(eds):
    t = eds[ed]
    entry = {"articles": {}, "transitional": {}}
    for n in ARTS:
        a = article(t, n)
        if a:
            entry["articles"][str(n)] = a[:2200]
    for n in (12, 19):
        p = transitional(t, n)
        entry["transitional"][str(n)] = p[:1800] if p else None
    out[ed] = entry

json.dump(out, open("/tmp/ck_provisions.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"editions with text: {len(out)}")
print(f"span: {min(out)} .. {max(out)}")
have19 = [e for e in sorted(out) if out[e]['transitional']['19']]
print(f"editions where paragraph 19 is present: {len(have19)}"
      f"  first {have19[0] if have19 else '-'}  last {have19[-1] if have19 else '-'}")
missing = [e for e in sorted(out) if len(out[e]["articles"]) < len(ARTS)]
print(f"editions missing one of the articles: {len(missing)}")
