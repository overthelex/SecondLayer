#!/usr/bin/env python3
"""Actual cost of the upstream smoke, agent and judge separately.

The estimate before the run was $1.20-4.20 on Haiku for three tasks. Estimates made from our own
Ukrainian runs may not transfer to English tasks with different workspace shapes, so the real
figure is read off the run metrics and the judge's own cost field rather than re-derived.
"""

import glob
import json

IN_PRICE, OUT_PRICE = 1.0, 5.0          # Haiku 4.5, USD per million, published 2026-08-11

agent_in = agent_out = 0
judge_cost = 0.0
rows = []

for rid_dir in sorted(glob.glob("results/upstream-smoke-*")):
    rid = rid_dir.split("/")[-1]
    mp = glob.glob(f"{rid_dir}/**/metrics.json", recursive=True) + \
         glob.glob(f"{rid_dir}/metrics.json")
    sp = glob.glob(f"{rid_dir}/**/scores.json", recursive=True) + \
         glob.glob(f"{rid_dir}/scores.json")
    m = json.load(open(mp[0], encoding="utf-8")) if mp else {}
    s = json.load(open(sp[0], encoding="utf-8")) if sp else {}
    ai, ao = m.get("input_tokens", 0), m.get("output_tokens", 0)
    agent_in += ai
    agent_out += ao
    jc = s.get("cost") or 0
    judge_cost += jc if isinstance(jc, (int, float)) else 0
    rows.append((rid.replace("upstream-smoke-", ""), m.get("turn_count"), ai, ao,
                 s.get("n_passed"), s.get("n_criteria"), jc))

print(f"{'task':46s} {'turns':>5} {'agent in':>10} {'out':>7}  score   judge $")
for t, turns, ai, ao, p, n, jc in rows:
    jc_s = f"{jc:.4f}" if isinstance(jc, (int, float)) and jc else "n/a"
    print(f"  {t[:44]:44s} {turns:>5} {ai:>10,} {ao:>7,}  {p}/{n}   {jc_s}")

agent_cost = agent_in * IN_PRICE / 1e6 + agent_out * OUT_PRICE / 1e6
print(f"\n  agent tokens: {agent_in:,} in / {agent_out:,} out")
print(f"  agent cost at Haiku 4.5 rates: ${agent_cost:.2f}")
print(f"  judge cost reported by the scorer: ${judge_cost:.2f}"
      if judge_cost else "  judge cost: not reported in scores.json")
print(f"  total: ${agent_cost + judge_cost:.2f} for {len(rows)} tasks"
      f"  (${(agent_cost + judge_cost) / max(1, len(rows)):.2f} per task)")
