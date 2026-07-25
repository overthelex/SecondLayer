#!/usr/bin/env python3
"""
UALB-5: temporal stability of bibliographic-coupling strength. Is coupling(A,B)
(decisions sharing cited statute articles) stable over time, or does it decay
as the time gap between the two decisions grows? If it decays, static coupling
relevance labels are time-sensitive. Dual of the co-citation-decay result in
arXiv:2605.17639. Runs ON prod over law_court_citations (decision->article).
"""
import math
import os
from collections import Counter, defaultdict

import psycopg2

N = int(os.environ.get("N", "5000"))
SEED = int(os.environ.get("SEED", "42"))
CAP = int(os.environ.get("CAP", "300"))       # skip article groups larger than this
MIN_GAP_N = int(os.environ.get("MIN_GAP_N", "50"))
ARTICLE_TYPES = ("codex_article", "law_article", "constitution", "transitional_provision")

conn = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
                        user=os.environ["POSTGRES_USER"],
                        password=os.environ["POSTGRES_PASSWORD"],
                        dbname=os.environ["POSTGRES_DB"])
cur = conn.cursor()
cur.execute("SET statement_timeout = '240000'")

cur.execute("""
    SELECT DISTINCT court_case_id
    FROM law_court_citations TABLESAMPLE SYSTEM (0.05) REPEATABLE (%s)
    WHERE citation_type = ANY(%s) AND adj_year IS NOT NULL
    LIMIT %s
""", (SEED, list(ARTICLE_TYPES), N))
S = [r[0] for r in cur.fetchall()]

cur.execute("""
    SELECT court_case_id, citation_type, law_number, law_article, adj_year
    FROM law_court_citations
    WHERE court_case_id = ANY(%s) AND citation_type = ANY(%s) AND adj_year IS NOT NULL
""", (S, list(ARTICLE_TYPES)))
arts = defaultdict(set)
year = {}
for cid, ctype, lnum, lart, yr in cur.fetchall():
    arts[cid].add(f"{ctype}|{lnum}|{lart}")
    year[cid] = int(yr)
conn.close()

# coupling pairs via inverted article index; strength + time gap
inv = defaultdict(list)
for d, aset in arts.items():
    for a in aset:
        inv[a].append(d)
gap_strength = defaultdict(lambda: [0, 0])   # gap -> [sum_strength, n_pairs]
pair_strength = Counter()
for a, ds in inv.items():
    if len(ds) > CAP:
        continue
    u = sorted(set(ds))
    for i in range(len(u)):
        for j in range(i + 1, len(u)):
            pair_strength[(u[i], u[j])] += 1
for (a, b), s in pair_strength.items():
    g = abs(year[a] - year[b])
    gap_strength[g][0] += s
    gap_strength[g][1] += 1


def mann_kendall(series):
    n = len(series)
    if n < 3:
        return {"n": n, "trend": "insufficient"}
    S = sum((series[j] > series[i]) - (series[j] < series[i])
            for i in range(n - 1) for j in range(i + 1, n))
    ties = Counter(series)
    var = (n * (n - 1) * (2 * n + 5)
           - sum(t * (t - 1) * (2 * t + 5) for t in ties.values())) / 18.0
    z = (S - 1) / math.sqrt(var) if S > 0 and var > 0 else \
        ((S + 1) / math.sqrt(var) if S < 0 and var > 0 else 0.0)
    p = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    tau = S / (0.5 * n * (n - 1))
    trend = "no-trend" if p >= 0.05 else ("increasing" if S > 0 else "decreasing")
    return {"n": n, "tau": round(tau, 4), "z": round(z, 3), "p": round(p, 6),
            "trend": trend}


rows = sorted((g, sa / n, n) for g, (sa, n) in gap_strength.items() if n >= MIN_GAP_N)
mk = mann_kendall([m for _, m, _ in rows])
print(f"sampled decisions: {len(S)} | coupled pairs: {sum(v[1] for v in gap_strength.values())}")
print("gap(yrs)  mean_coupling_strength  n_pairs")
for g, mean_s, n in rows:
    print(f"  {g:3d}      {mean_s:6.3f}                {n}")
print("Mann-Kendall (mean coupling strength vs time gap):", mk)

out = os.environ.get("OUT")
if out:
    import json
    json.dump({"sampled_decisions": len(S),
               "coupled_pairs": sum(v[1] for v in gap_strength.values()),
               "gap_series": [{"gap": g, "mean_strength": round(m, 3), "n": n}
                              for g, m, n in rows],
               "mann_kendall": mk}, open(out, "w"), indent=2)
    print("wrote", out)
