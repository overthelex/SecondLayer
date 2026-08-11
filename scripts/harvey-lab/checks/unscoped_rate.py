#!/usr/bin/env python3
"""Measure what the identifier gate would do if it were NOT scoped by jurisdiction.

The PR argues that running the Ukrainian checkers over every task would make the gate useless.
That is currently an assertion with a back-of-envelope behind it ("about one 8-digit number in
eleven"). A maintainer deciding whether the extra machinery is justified deserves the real
number, measured on their own corpus.

Reports how many upstream US tasks the Ukrainian checkers would flag, and on what.
"""
import collections
import glob
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, "tests")
from test_no_real_identifiers import CHECKERS_BY_JURISDICTION, read_text  # noqa: E402

flagged = collections.Counter()
examples = collections.defaultdict(list)
docs = 0
tasks = set()

for path in glob.glob("tasks/*/*/documents/*") + glob.glob("tasks/*/*/*/documents/*"):
    if os.path.isdir(path):
        continue
    tid = "/".join(path.split("/")[1:3])
    if tid.split("/")[-1].startswith("ua-"):
        continue
    try:
        text = read_text(Path(path))
    except Exception:
        continue
    docs += 1
    for label, pattern, checker in CHECKERS_BY_JURISDICTION["UA"]:
        for m in pattern.findall(text):
            if checker(m):
                flagged[label] += 1
                tasks.add(tid)
                if len(examples[label]) < 4:
                    i = text.find(m)
                    examples[label].append((tid, m, re.sub(r"\s+", " ", text[max(0, i-55):i+25])))

print(f"upstream documents scanned: {docs:,}")
print(f"tasks that would be blocked if the UA checkers ran unscoped: {len(tasks):,}\n")
for label, n in flagged.most_common():
    print(f"  {label}: {n:,} hits")
    for tid, val, ctx in examples[label]:
        print(f"      {tid}  {val}  ...{ctx.strip()}...")
