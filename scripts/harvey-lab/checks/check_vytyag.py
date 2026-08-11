#!/usr/bin/env python3
"""The extract must carry law and nothing else.

A closed-universe workspace with a URL in it is a contradiction, and an editorial marker such as
{Пункт 19 розділу виключено на підставі Закону № 4434-IX} would hand over the answer the task
exists to ask. Both are asserted against the generated documents rather than trusted to the
stripping regexes.
"""

import glob
import re
import sys
import zipfile

BAD = {
    "a URL": re.compile(r"https?://"),
    "an edition stamp": re.compile(r"\bed\d{8}\b"),
    "an editorial marker": re.compile(r"\{[^}]*(?:виключено|доповнено|в редакції)"),
    "a 'currently in force' hint": re.compile(r"чинн[аиої]{1,2}\s+редакц"),
}


def text(path):
    z = zipfile.ZipFile(path)
    return re.sub(r"\s+", " ",
                  re.sub(r"<[^>]+>", " ",
                         z.read("word/document.xml").decode("utf-8", "ignore")))


bad = 0
files = sorted(glob.glob("**/litigation-dispute-resolution/*/documents/vytyag-*.docx",
                         recursive=True) +
               glob.glob("litigation-dispute-resolution/*/documents/vytyag-*.docx"))
if not files:
    # A checker that finds nothing must say so, not report success.
    sys.exit("no extract documents found — the glob matched nothing, so nothing was checked")
for f in sorted(set(files)):
    slug = [x for x in f.split("/") if x.startswith("ua-")][0]
    t = text(f)
    hits = [name for name, pat in BAD.items() if pat.search(t)]
    n19 = len(re.findall(r"19\.\s*У період дії", t))
    n12 = len(re.findall(r"12\.\s*Під час дії карантину", t))
    eds = re.findall(r"станом на (\d{2}\.\d{2}\.\d{4})", t)
    print(f"  {slug[:44]:44s} {len(t.split()):5d}w  editions {len(eds)}  "
          f"п.12×{n12} п.19×{n19}  {'CLEAN' if not hits else 'PROBLEM: ' + ', '.join(hits)}")
    bad += len(hits)

print(f"\n{'no chrome or giveaways found' if not bad else str(bad) + ' problems'}")
sys.exit(1 if bad else 0)
