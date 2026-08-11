"""Which criteria never fail? Those measure nothing and are the ones to cut or harden."""
import json, glob
from pathlib import Path
from collections import defaultdict

newest = {}
for f in glob.glob("results/**/scores.json", recursive=True):
    if "sonnet-4-6" not in f: continue
    d = json.load(open(f, encoding="utf-8"))
    t = d["task"]
    if t not in newest or Path(f).parent.name > Path(newest[t]).parent.name:
        newest[t] = f

stat = defaultdict(lambda: [0, 0])   # title -> [passed, seen]
src  = {}
for f in newest.values():
    d = json.load(open(f, encoding="utf-8"))
    tj = Path("tasks") / d["task"] / "task.json"
    if not tj.exists(): continue
    cfg = json.loads(tj.read_text(encoding="utf-8"))
    if cfg.get("jurisdiction") != "UA": continue
    by_id = {c["id"]: c for c in cfg["criteria"]}
    for cr in d.get("criteria_results", []):
        title = cr.get("title") or cr.get("id")
        ok = cr.get("passed") if "passed" in cr else (cr.get("verdict") == "pass")
        stat[title][1] += 1
        stat[title][0] += bool(ok)
        c = by_id.get(cr.get("id"))
        if c: src[title] = c.get("source", "expert")

always = [(t, s[1]) for t, s in stat.items() if s[0] == s[1] and s[1] >= 3]
always.sort(key=lambda x: -x[1])
tot_always = sum(n for _, n in always)
tot = sum(s[1] for s in stat.values())
print(f"criteria instances total: {tot}")
print(f"instances of criteria that NEVER fail (seen >=3x): {tot_always} = {100*tot_always/tot:.0f}%\n")
print("=== never-failing criteria, by how many tasks reuse them ===")
for t, n in always:
    print(f"  x{n:2d}  [{src.get(t,'?'):6s}]  {t[:80]}")
