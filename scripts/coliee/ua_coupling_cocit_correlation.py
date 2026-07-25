#!/usr/bin/env python3
"""
UALB-4: correlation between bibliographic coupling and co-citation on the SAME
case pairs of the Ukrainian case->case precedent graph. For a case pair (a,b):
  coupling(a,b)   = |Out(a) ∩ Out(b)|  (cases both a and b cite)   [shared OUT]
  cocitation(a,b) = |In(a)  ∩ In(b)|   (cases citing both a and b)  [shared IN]
These are duals; the question is whether they rank the same "similar" pairs or
complementary ones. Runs ON prod over case_citation_links (non-self resolved
precedent edges). Prints correlation + overlap stats.
"""
import math
import os
from collections import Counter, defaultdict

import psycopg2

N = int(os.environ.get("N", "6000"))     # sampled cases
SEED = int(os.environ.get("SEED", "42"))
CAP = int(os.environ.get("CAP", "150"))  # skip hub groups larger than this

conn = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
                        user=os.environ["POSTGRES_USER"],
                        password=os.environ["POSTGRES_PASSWORD"],
                        dbname=os.environ["POSTGRES_DB"])
cur = conn.cursor()
cur.execute("SET statement_timeout = '240000'")

# sample cases that BOTH cite and are cited (so both Out and In can be non-empty)
cur.execute("""
    SELECT from_doc_id
    FROM case_citation_links TABLESAMPLE SYSTEM (0.5) REPEATABLE (%s)
    WHERE resolved AND NOT is_self_citation AND latest_doc_id IS NOT NULL
    GROUP BY from_doc_id
    LIMIT %s
""", (SEED, N))
S = set(r[0] for r in cur.fetchall())

# Out(a) for a in S  (edges FROM sampled cases)
cur.execute("""SELECT from_doc_id, latest_doc_id FROM case_citation_links
               WHERE from_doc_id = ANY(%s) AND resolved AND NOT is_self_citation
                 AND latest_doc_id IS NOT NULL""", (list(S),))
Out = defaultdict(set)
for a, x in cur.fetchall():
    if x != a:
        Out[a].add(x)

# In(a) for a in S  (edges TO sampled cases) -- who cites the sampled cases
cur.execute("""SELECT from_doc_id, latest_doc_id FROM case_citation_links
               WHERE latest_doc_id = ANY(%s) AND resolved AND NOT is_self_citation""",
            (list(S),))
In = defaultdict(set)
for y, a in cur.fetchall():
    if y != a:
        In[a].add(y)
conn.close()

# coupling pairs: invert Out over cited target x -> sampled cases citing x
coupling = Counter()
inv_out = defaultdict(list)
for a, xs in Out.items():
    for x in xs:
        inv_out[x].append(a)
for x, lst in inv_out.items():
    if len(lst) > CAP:
        continue
    u = sorted(set(lst))
    for i in range(len(u)):
        for j in range(i + 1, len(u)):
            coupling[(u[i], u[j])] += 1

# co-citation pairs (independent): invert In over citing case y -> sampled
# cases cited by y (these are pairs co-cited by a common decision)
cocit = Counter()
inv_in = defaultdict(list)
for a, ys_ in In.items():
    for y in ys_:
        inv_in[y].append(a)
for y, lst in inv_in.items():
    if len(lst) > CAP:
        continue
    u = sorted(set(lst))
    for i in range(len(u)):
        for j in range(i + 1, len(u)):
            cocit[(u[i], u[j])] += 1

# For the CORRELATION we evaluate both measures on the SAME pairs (the union of
# coupled and co-cited pairs), computing co-citation DIRECTLY from the full In
# sets so it is not restricted to same-sample citers.
pairs = set(coupling) | set(cocit)
xs, ys = [], []
for (a, b) in pairs:
    xs.append(coupling.get((a, b), 0))
    ys.append(len(In.get(a, set()) & In.get(b, set())))   # direct co-citation
n = len(pairs)


def pearson(xs, ys):
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx and syy else 0.0


coupled = sum(1 for x in xs if x > 0)
both = sum(1 for x, y in zip(xs, ys) if x > 0 and y > 0)
print(f"sampled cases:            {len(S)}")
print(f"coupled pairs (coupling>0): {len(coupling)}")
print(f"co-cited pairs (sample):    {len(cocit)}")
print(f"union pairs evaluated:      {n}")
print(f"coupled pairs also co-cited (direct In-overlap>0): {both}  "
      f"({100*both/max(1,coupled):.2f}% of coupled pairs)")
r = pearson(xs, ys)
print(f"Pearson r (coupling vs direct co-citation): {r:.4f}")

out = os.environ.get("OUT")
if out:
    import json
    json.dump({"sampled_cases": len(S), "coupled_pairs": len(coupling),
               "coupled_also_cocited": both,
               "overlap_pct": round(100 * both / max(1, coupled), 3),
               "pearson_r": round(r, 4)}, open(out, "w"), indent=2)
    print("wrote", out)
