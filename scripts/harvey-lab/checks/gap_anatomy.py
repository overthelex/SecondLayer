#!/usr/bin/env python3
"""Find the structural source of upstream's criteria density.

"Their matters have more findings than ours" is a restatement, not a diagnosis. If the gap is
to be closed on Ukrainian data, it has to be attributed to something buildable: the size of the
documents, their kind, the work type, or the number of distinct instruments in contention.

Measures, over upstream graded tasks: criteria against total words in the workspace, against
document kind, and against work_type. Then does the same for the Ukrainian pack, so the gap is
expressed in units we can act on.
"""

import collections
import glob
import json
import os
import statistics
import zipfile


def words(path):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".docx":
            z = zipfile.ZipFile(path)
            import re
            xml = z.read("word/document.xml").decode("utf-8", "ignore")
            return len(re.sub(r"<[^>]+>", " ", xml).split())
        if ext == ".xlsx":
            z = zipfile.ZipFile(path)
            n = 0
            for name in z.namelist():
                if "sharedStrings" in name or "sheet" in name:
                    import re
                    n += len(re.sub(r"<[^>]+>", " ", z.read(name).decode("utf-8", "ignore")).split())
            return n
        if ext in (".txt", ".eml", ".md", ".csv"):
            return len(open(path, encoding="utf-8", errors="ignore").read().split())
    except Exception:
        return 0
    return 0


rows = []
for path in glob.glob("tasks/*/*/task.json"):
    d = json.load(open(path, encoding="utf-8"))
    if not d.get("work_type"):
        continue
    ua = "/ua-" in path
    docdir = os.path.join(os.path.dirname(path), "documents")
    files = glob.glob(os.path.join(docdir, "*")) if os.path.isdir(docdir) else []
    w = sum(words(f) for f in files)
    exts = collections.Counter(os.path.splitext(f)[1].lower() for f in files)
    rows.append((ua, len(d["criteria"]), len(files), w, d["work_type"], exts))

up = [r for r in rows if not r[0]]
ours = [r for r in rows if r[0]]
print(f"upstream graded {len(up)}   ukrainian {len(ours)}\n")

for label, g in (("upstream", up), ("ukrainian", ours)):
    if not g:
        continue
    w = [r[3] for r in g]
    c = [r[1] for r in g]
    print(f"{label:10s} criteria median {statistics.median(c):5.0f}   "
          f"workspace words median {statistics.median(w):7.0f}   "
          f"criteria per 1k words {1000 * statistics.median(c) / max(1, statistics.median(w)):.1f}")

print("\nupstream criteria by workspace size:")
for lo, hi in ((0, 2000), (2000, 5000), (5000, 10000), (10000, 25000), (25000, 10 ** 9)):
    g = [r[1] for r in up if lo <= r[3] < hi]
    if len(g) < 10:
        continue
    print(f"  {lo:6d}-{hi:<8d} words  n={len(g):4d}  criteria median {statistics.median(g):5.0f}")

print("\nupstream criteria by work_type:")
byt = collections.defaultdict(list)
for r in up:
    byt[r[4]].append(r[1])
for k, v in sorted(byt.items(), key=lambda kv: -len(kv[1])):
    print(f"  {k:10s} n={len(v):4d}  criteria median {statistics.median(v):5.0f}")

ext = collections.Counter()
for r in up:
    ext.update(r[5])
print("\nupstream document kinds:", dict(ext.most_common(8)))
ext = collections.Counter()
for r in ours:
    ext.update(r[5])
print("ukrainian document kinds:", dict(ext.most_common(8)))
