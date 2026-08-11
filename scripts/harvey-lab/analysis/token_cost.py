#!/usr/bin/env python3
"""What one run of a statute-review task actually costs in tokens, measured not assumed.

The estimate for a first-party API smoke has to come from real runs. Ours are the closest thing
available: same harness, same task shape, one model. Prices are the current published first-party
rates, applied to measured token counts.
"""
import glob
import json
import os
import statistics

PRICES = {                      # USD per million tokens, first-party, published 2026-08-11
    "haiku-4.5":  (1.0, 5.0),
    "sonnet-5":   (2.0, 10.0),  # introductory, through 2026-08-31
    "sonnet-4.6": (3.0, 15.0),
}

rows = []
for p in glob.glob("results/smoke*/**/metrics.json", recursive=True) + \
         glob.glob("results/smoke*/metrics.json"):
    d = json.load(open(p, encoding="utf-8"))
    rows.append((d["run_id"], d.get("turn_count"), d["input_tokens"], d["output_tokens"],
                 d.get("wall_clock_seconds")))
rows = sorted(set(rows))

print(f"{'run':46s} {'turns':>5} {'input':>10} {'output':>8} {'sec':>6}")
for rid, t, i, o, w in rows:
    print(f"  {rid[:44]:44s} {t:>5} {i:>10,} {o:>8,} {w:>6.0f}")

ins = [r[2] for r in rows]
outs = [r[3] for r in rows]
print(f"\n  input tokens: median {statistics.median(ins):,.0f}  "
      f"min {min(ins):,}  max {max(ins):,}")
print(f"  output tokens: median {statistics.median(outs):,.0f}")

print("\ncost of ONE run at first-party rates, on the median:")
mi, mo = statistics.median(ins), statistics.median(outs)
for name, (pi, po) in PRICES.items():
    print(f"  {name:11s} ${mi * pi / 1e6:5.2f} in + ${mo * po / 1e6:5.2f} out = "
          f"${mi * pi / 1e6 + mo * po / 1e6:5.2f}")
print("\nsame at the worst run observed:")
xi, xo = max(ins), max(outs)
for name, (pi, po) in PRICES.items():
    print(f"  {name:11s} ${xi * pi / 1e6 + xo * po / 1e6:5.2f}")
