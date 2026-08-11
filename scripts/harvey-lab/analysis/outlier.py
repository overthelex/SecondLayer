import json, glob
rows = []
for f in glob.glob("tasks/**/task.json", recursive=True):
    c = json.load(open(f, encoding="utf-8"))
    rows.append((len(c.get("criteria", [])), c.get("work_type"), f))
rows.sort(key=lambda r: -r[0])
print("TOP 6 by criteria count:")
for n, wt, f in rows[:6]:
    print("  %5d  work_type=%-8s %s" % (n, wt, f))
print()
print("tasks with >194 criteria:", sum(1 for n, _, _ in rows if n > 194))
print("of those, work_type=None:", sum(1 for n, wt, _ in rows if n > 194 and wt is None))
print()
withwt = sorted(n for n, wt, _ in rows if wt is not None)
import statistics
print("SUBSET with a work_type (closest proxy for Joel's 1251 public tasks): n=%d" % len(withwt))
print("  mean=%.1f median=%d min=%d max=%d" % (
    statistics.mean(withwt), statistics.median(withwt), min(withwt), max(withwt)))
