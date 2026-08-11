#!/usr/bin/env python3
"""Which KIND of planted defect does the model actually miss?

"Make the defects subtler" is a hunch until it says what subtler means. The runs already contain
the answer: every defect is one of a few shapes, and the shapes have different pass rates.

Classification, from the clause text and the claim:
  numeric      — a figure against a figure (75 years vs 50, 60 days vs 30, 0.2% vs 0.5%)
  mechanism    — the clause names the wrong legal operation (void vs voidable on approval,
                 extends vs suspends, consent vs no consent)
  quorum       — a voting threshold
  form         — notarisation, signature, written form
  scope        — the clause removes or narrows a right the Act confers
  omission     — a mandatory item simply absent
  lawful-trap  — permitted by the Act, must NOT be called a breach
"""

import collections
import glob
import json
import re

SHAPES = [
    ("numeric", re.compile(r"\d+\s*(?:рок|днів|день|місяц|відсот|%)|\d+\s*(?:years|days|per cent)")),
    ("quorum", re.compile(r"більшіст|чверт|одностайн|голос|majority|quarters|unanim")),
    ("form", re.compile(r"нотаріал|підпис|письмов|notaris|signature|written")),
    ("mechanism", re.compile(r"нікчем|схвален|продовж|зупин|void|approval|extend|suspend")),
    ("scope", re.compile(r"право|заборон|не має права|виключно|right|prohibit|only")),
]


def shape(text):
    for name, pat in SHAPES:
        if pat.search(text):
            return name
    return "other"


# per-criterion outcomes from every statute-review run we have
outcome = collections.defaultdict(list)
for path in glob.glob("results/smoke7-*/**/scores.json", recursive=True) + \
            glob.glob("results/smoke7-*/scores.json") + \
            glob.glob("results/smoke-statut-*/**/scores.json", recursive=True) + \
            glob.glob("results/smoke-statut-*/scores.json"):
    d = json.load(open(path, encoding="utf-8"))
    for c in d["criteria_results"]:
        outcome[(d["task"].split("/")[-1], c["title"])].append(
            str(c["verdict"]).lower() == "pass")

# join outcomes to the defect they belong to, via the ISSUE_/OVER- prefix
byshape = collections.defaultdict(lambda: [0, 0])
detail = collections.defaultdict(list)
for (task, title), vals in outcome.items():
    if title.startswith("OVER-FLAGGING"):
        s = "lawful-trap"
    elif "(missing)" in title:
        s = "omission"
    elif title.startswith("ISSUE"):
        s = shape(title)
    else:
        continue
    if "identifies the defect" not in title and s not in ("lawful-trap", "omission"):
        continue          # one row per defect, not three
    byshape[s][0] += sum(vals)
    byshape[s][1] += len(vals)
    detail[s].append((task, title[:66], f"{sum(vals)}/{len(vals)}"))

print(f"{'defect shape':14s} {'passed':>10}   rate")
for s, (p, n) in sorted(byshape.items(), key=lambda kv: kv[1][0] / max(1, kv[1][1])):
    print(f"  {s:12s} {p:4d}/{n:<4d} {100 * p / n:6.1f}%")

print("\nanything the model actually missed:")
for s, items in sorted(detail.items()):
    for task, title, score in items:
        p, n = score.split("/")
        if int(p) < int(n):
            print(f"  [{s}] {task[:34]:34s} {score}  {title}")
