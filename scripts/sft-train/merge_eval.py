#!/usr/bin/env python3
"""Merge data-parallel eval shard JSONs (sum raw counts -> final faithfulness %)."""
import glob
import json
import sys

pattern, out = sys.argv[1], sys.argv[2]
agg = {"tot_cit": 0, "rel_cit": 0, "dis_cit": 0, "oth_cit": 0,
       "norm_total": 0, "with_cite": 0, "norm_hedge": 0, "ref_total": 0, "ref_correct": 0}
label = None
for p in sorted(glob.glob(pattern)):
    d = json.load(open(p))
    label = d.get("label")
    for k in agg:
        agg[k] += d["counts"][k]

t = agg["tot_cit"] or 1
res = {
    "label": label,
    "normal_examples": agg["norm_total"], "refusal_examples": agg["ref_total"],
    "total_citations": agg["tot_cit"],
    "pct_relevant": round(100 * agg["rel_cit"] / t, 2),
    "pct_distractor": round(100 * agg["dis_cit"] / t, 2),
    "pct_out_of_context": round(100 * agg["oth_cit"] / t, 2),
    "pct_normal_with_citation": round(100 * agg["with_cite"] / max(1, agg["norm_total"]), 2),
    "pct_normal_hedged": round(100 * agg["norm_hedge"] / max(1, agg["norm_total"]), 2),
    "refusal_correct_pct": round(100 * agg["ref_correct"] / max(1, agg["ref_total"]), 2),
    "avg_citations_per_answer": round(agg["tot_cit"] / max(1, agg["norm_total"]), 2),
}
json.dump(res, open(out, "w"), ensure_ascii=False, indent=2)
print(json.dumps(res, ensure_ascii=False, indent=2))
