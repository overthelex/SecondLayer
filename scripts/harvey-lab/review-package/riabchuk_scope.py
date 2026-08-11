#!/usr/bin/env python3
"""What actually needs a Ukrainian advocate, and how much of it is there.

The package sent for review covers 6 litigation and 3 diligence tasks. Two questions follow.
Is the coverage still current — and is it the right scope at all?

Scope test: a criterion needs a lawyer only if getting it wrong is a legal error. The diligence
family's truth lives entirely inside synthetic documents, so checking those is reading a docx and
comparing figures — anyone can do it, and it is not what an advocate's hour is for. What does
need him is every place we assert what a provision of Ukrainian law says or requires.
"""

import collections
import glob
import json

PKG = {
    "ua-limitation-period-martial-law", "ua-limitation-contractual-shortening-void",
    "ua-limitation-extended-by-agreement", "ua-limitation-not-raised-by-party",
    "ua-limitation-penalty-one-year", "ua-limitation-quarantine-vs-martial-law",
    "ua-agro-supply-v2", "ua-transport-fleet-v2", "ua-food-tax-v2",
}

fam = collections.Counter()
legal = collections.Counter()
covered = collections.Counter()
per_task = {}

for tj in sorted(glob.glob("tasks/*/ua-*/task.json")):
    slug = tj.split("/")[2]
    area = tj.split("/")[1]
    d = json.load(open(tj, encoding="utf-8"))
    if slug.startswith("ua-limitation"):
        family = "litigation"
    elif slug.endswith("-review"):
        family = "statute-review"
    else:
        family = "diligence"
    # A criterion needs legal review if it asserts what a provision says or requires.
    n_legal = sum(
        1 for c in d["criteria"]
        if any(k in c["match_criteria"] for k in
               ("статт", "Article", "частина", "пункт", "paragraph", "Act", "Code"))
    )
    fam[family] += len(d["criteria"])
    legal[family] += n_legal
    if slug in PKG:
        covered[family] += n_legal
    per_task[slug] = (family, len(d["criteria"]), n_legal, slug in PKG)

print(f"{'family':16s} {'criteria':>9} {'need a lawyer':>14} {'in the package':>16}")
for f in ("litigation", "statute-review", "diligence"):
    print(f"  {f:14s} {fam[f]:9d} {legal[f]:14d} {covered[f]:16d}")
print(f"  {'TOTAL':14s} {sum(fam.values()):9d} {sum(legal.values()):14d} {sum(covered.values()):16d}")

print("\ntasks the package never sees:")
for slug, (family, n, nl, inpkg) in sorted(per_task.items(), key=lambda kv: kv[1][0]):
    if not inpkg and nl:
        print(f"  {family:15s} {slug:44s} {nl:3d} legal criteria")
