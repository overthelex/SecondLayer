#!/usr/bin/env python3
"""Show that the range statistic cannot be quoted at a fixed trial count.

Six tasks now have six trials each: three from pack3 and three from the re-run after a wording
correction that moved no mean by more than 0.67 of a criterion. That gives a free handle on a
question the pack figure cannot answer: how much of a per-task "spread" is a property of the
task and how much is an artefact of having looked three times.

For each task the observed range over all six trials is compared with the average range over
every 3-subset of those same six trials. If range grew, the statistic is measuring the number
of trials, not the task, and must not be reported as a task property.
"""

import itertools
import re
import statistics

ROW = re.compile(r"(\d)\t(\S+)\t\s*(\d+)/(\d+) criteria passed")
REDONE = {
    "ua-limitation-contractual-shortening-void",
    "ua-limitation-extended-by-agreement",
    "ua-limitation-not-raised-by-party",
    "ua-limitation-penalty-one-year",
    "ua-limitation-period-martial-law",
    "ua-limitation-quarantine-vs-martial-law",
}


def load(path):
    by = {}
    for line in open(path, encoding="utf-8"):
        m = ROW.match(line)
        if m:
            by.setdefault(m.group(2), (int(m.group(4)), []))[1].append(int(m.group(3)))
    return by


old, new = load("pack3.log"), load("redo6.log")
print(f"{'task':44s} {'n=6 trials':22s} {'range@6':>8s} {'mean range@3':>13s} {'sd':>6s}")
g6, g3 = [], []
for task in sorted(new):
    short = task.split("/")[-1]
    if short not in REDONE:
        continue
    xs = old[task][1] + new[task][1]
    r6 = max(xs) - min(xs)
    r3 = statistics.mean(max(c) - min(c) for c in itertools.combinations(xs, 3))
    g6.append(r6)
    g3.append(r3)
    print(f"  {short:42s} {str(xs):22s} {r6:8d} {r3:13.2f} {statistics.stdev(xs):6.2f}")

print(f"\n  mean range at 6 trials: {statistics.mean(g6):.2f}")
print(f"  mean range at 3 trials: {statistics.mean(g3):.2f}")
print(f"  inflation from looking twice as often: "
      f"{statistics.mean(g6) / statistics.mean(g3):.2f}x")
