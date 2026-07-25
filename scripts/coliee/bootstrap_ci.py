#!/usr/bin/env python3
"""Bootstrap 95% CIs for the retrieval metrics and a UA vs CA significance test,
from the per-query dumps of retrieval_experiment.py (--per-query-json).
Stdlib only. Usage: bootstrap_ci.py ca_perq.json ua_perq.json [out.json]"""
import json
import random
import sys

random.seed(42)
B = 5000
METRICS = ["f1", "extp", "cov"]
MODELS = ["bm25", "e5", "bge-m3"]


def boot_ci(vals):
    n = len(vals)
    ms = sorted(sum(vals[random.randrange(n)] for _ in range(n)) / n for _ in range(B))
    return sum(vals) / n, ms[int(0.025 * B)], ms[int(0.975 * B)]


def boot_diff(a, b):  # mean(a) - mean(b), 95% CI
    na, nb = len(a), len(b)
    ds = sorted((sum(a[random.randrange(na)] for _ in range(na)) / na
                 - sum(b[random.randrange(nb)] for _ in range(nb)) / nb)
                for _ in range(B))
    return sum(a) / na - sum(b) / nb, ds[int(0.025 * B)], ds[int(0.975 * B)]


ca = json.load(open(sys.argv[1]))["per_query"]
ua = json.load(open(sys.argv[2]))["per_query"]
k = json.load(open(sys.argv[1])).get("k", 5)
out = {"k": k, "ci": {}, "ua_vs_ca": {}}

print(f"=== 95% bootstrap CIs (metric@{k}, B={B}) ===")
for corpus, data in (("CA", ca), ("UA", ua)):
    for model in MODELS:
        if model not in data:
            continue
        recs = data[model]
        for m in METRICS:
            vals = [r[m] for r in recs if m in r]
            if not vals:
                continue
            mean, lo, hi = boot_ci(vals)
            out["ci"][f"{corpus}.{model}.{m}"] = [round(mean, 4), round(lo, 4), round(hi, 4)]
            print(f"  {corpus:2s} {model:7s} {m:4s}@{k}: {mean:.4f}  [{lo:.4f}, {hi:.4f}]")

print(f"\n=== UA vs CA difference of means (metric@{k}, 95% CI; sig = CI excludes 0) ===")
for model in MODELS:
    if model not in ua or model not in ca:
        continue
    for m in METRICS:
        a = [r[m] for r in ua[model] if m in r]
        b = [r[m] for r in ca[model] if m in r]
        if not a or not b:
            continue
        d, lo, hi = boot_diff(a, b)
        sig = (lo > 0) or (hi < 0)
        out["ua_vs_ca"][f"{model}.{m}"] = [round(d, 4), round(lo, 4), round(hi, 4), sig]
        print(f"  {model:7s} {m:4s}: UA-CA = {d:+.4f}  [{lo:+.4f}, {hi:+.4f}]  "
              f"{'SIGNIFICANT' if sig else 'n.s.'}")

if len(sys.argv) > 3:
    json.dump(out, open(sys.argv[3], "w"), indent=2)
    print(f"\nwrote {sys.argv[3]}")
