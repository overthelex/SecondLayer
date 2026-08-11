#!/usr/bin/env python3
"""Mine the eight acts for the two things that measured as discriminating, plus the untested one.

Porting by hand means reading eight acts again. The material has a recognisable shape, so it is
found mechanically and then judged by eye:

  omission candidates — articles that enumerate what a document MUST contain. Every item in such
    a list is a planted omission whose grounding is one quoted phrase.
  qualifier traps — a prominently stated default followed by "якщо інше не передбачено/
    встановлено". This is the shape the hypothesis says catches, and which I failed to build last
    time: I built "a statutory duty restated" instead, and it caught nothing.
"""

import json
import re
import textwrap

ACTS = json.load(open("/tmp/acts.json", encoding="utf-8"))

MUST = re.compile(
    r"(істотн\w+ умов\w+|повинен містити|має містити|зазначаються так[іі] відомост|"
    r"зазначаються відомості про|у \w+ зазначаються|обов'язково зазначаються)", re.I)
QUAL = re.compile(r"якщо інше не (?:передбачено|встановлено|визначено)[^.;]{0,60}", re.I)


def strip(t):
    return re.sub(r"\s+", " ", re.sub(r"\{[^{}]*\}", "", t))


for nreg, act in ACTS.items():
    print("=" * 98)
    print(f"{nreg}  {act['name']}")
    lists, quals = [], []
    for a in act["articles"]:
        body = strip(a["text"])
        if MUST.search(body):
            m = MUST.search(body)
            lists.append((a["n"], body[m.start():m.start() + 420]))
        for q in QUAL.finditer(body):
            lead = body[max(0, q.start() - 150):q.start()]
            quals.append((a["n"], lead[-150:], q.group(0)))

    print(f"  mandatory-content articles: {[n for n, _ in lists]}")
    for n, snip in lists[:2]:
        print(textwrap.fill(f"    ст.{n}: {snip}", 96, subsequent_indent="        "))
    print(f"  qualifier occurrences: {len(quals)}  in articles "
          f"{sorted({n for n, _, _ in quals})}")
    for n, lead, q in quals[:3]:
        print(textwrap.fill(f"    ст.{n}: …{lead.strip()} [{q}]", 96,
                            subsequent_indent="        "))
