import json, glob, statistics
files = sorted(glob.glob("tasks/**/task.json", recursive=True))
crit, wt, locales = [], {}, {}
areas = set()
for f in files:
    c = json.load(open(f, encoding="utf-8"))
    crit.append(len(c.get("criteria", [])))
    wt[c.get("work_type")] = wt.get(c.get("work_type"), 0) + 1
    areas.add(f.split("/")[1])
    key = "%s/%s" % (c.get("language", "en"), c.get("jurisdiction", "US"))
    locales[key] = locales.get(key, 0) + 1
crit.sort()
print("FULL CORPUS (every task.json, not a sample)")
print("  tasks:", len(files))
print("  practice areas:", len(areas))
print("  criteria mean=%.1f median=%d min=%d max=%d" % (
    statistics.mean(crit), statistics.median(crit), min(crit), max(crit)))
print("  work_type:", dict(sorted(wt.items(), key=lambda x: -x[1])))
print("  locales:", locales)
