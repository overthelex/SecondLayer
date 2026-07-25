#!/usr/bin/env python3
"""
Full Ukrainian case->case citation-age temporal analysis, symmetric with the
Canadian fig1 (mean age by citing year + Mann-Kendall) and fig2 (age
distribution). Runs over ALL non-self resolved precedent edges in
case_citation_links (not a sample). Server-side aggregation by
(citing_year, cited_year) keeps it cheap. Runs ON prod; prints JSON to stdout.
"""
import json
import math
import os
import sys
from collections import Counter, defaultdict

import psycopg2

conn = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
                        user=os.environ["POSTGRES_USER"],
                        password=os.environ["POSTGRES_PASSWORD"],
                        dbname=os.environ["POSTGRES_DB"])
cur = conn.cursor()
cur.execute("SET statement_timeout = '600000'")
MIN_YEAR_N = int(os.environ.get("MIN_YEAR_N", "10"))


def mann_kendall(series):
    n = len(series)
    if n < 3:
        return {"n": n, "trend": "insufficient-data"}
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            s += (series[j] > series[i]) - (series[j] < series[i])
    ties = Counter(series)
    tie = sum(t * (t - 1) * (2 * t + 5) for t in ties.values())
    var = (n * (n - 1) * (2 * n + 5) - tie) / 18.0
    z = (s - 1) / math.sqrt(var) if s > 0 and var > 0 else \
        ((s + 1) / math.sqrt(var) if s < 0 and var > 0 else 0.0)
    p = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    tau = s / (0.5 * n * (n - 1))
    trend = "no-trend" if p >= 0.05 else ("increasing" if s > 0 else "decreasing")
    return {"n": n, "S": s, "tau": round(tau, 4), "z": round(z, 3),
            "p": round(p, 6), "trend": trend}


# sanity: is case_citation_links.adj_year the citing (from_doc) year?
cur.execute("""
    SELECT c.adj_year, f.adj_year
    FROM case_citation_links c JOIN edrsr_fulltext f ON f.doc_id = c.from_doc_id
    WHERE c.adj_year IS NOT NULL AND f.adj_year IS NOT NULL LIMIT 200""")
same = [1 for a, b in cur.fetchall() if a == b]
print(f"# adj_year==from_doc year on sample: {len(same)}/200", file=sys.stderr)

# full aggregation: citing_year x cited_year counts
cur.execute("""
    SELECT c.adj_year AS citing_year, t.adj_year AS cited_year, count(*)
    FROM case_citation_links c
    JOIN edrsr_fulltext t ON t.doc_id = c.latest_doc_id
    WHERE c.resolved AND NOT c.is_self_citation
      AND c.adj_year IS NOT NULL AND t.adj_year IS NOT NULL
    GROUP BY 1, 2""")
rows = cur.fetchall()
conn.close()

per_year = defaultdict(lambda: [0, 0])   # citing_year -> [sum_age, n]
age_hist = Counter()
total = neg = 0
for cy, ty, cnt in rows:
    total += cnt
    age = cy - ty
    if age < 0:
        neg += cnt
        continue
    per_year[cy][0] += age * cnt
    per_year[cy][1] += cnt
    age_hist[age] += cnt

yearly = sorted((y, sa / n, n) for y, (sa, n) in per_year.items() if n >= MIN_YEAR_N)
stats = {
    "edges_with_both_years": total,
    "citation_age_negative_frac": round(neg / total, 4) if total else 0,
    "min_year_n": MIN_YEAR_N,
    "mean_age_by_citing_year": [
        {"year": y, "mean_age": round(a, 2), "n": n} for y, a, n in yearly],
    "citation_age_hist": [{"age": a, "count": c} for a, c in sorted(age_hist.items())],
    "mann_kendall_mean_age_trend": mann_kendall([a for _, a, _ in yearly]),
}
# overall mean/median age
flat_total = sum(age_hist.values())
cum, med = 0, None
for a, c in sorted(age_hist.items()):
    cum += c
    if med is None and cum >= flat_total / 2:
        med = a
stats["citation_age_mean"] = round(
    sum(a * c for a, c in age_hist.items()) / flat_total, 2) if flat_total else None
stats["citation_age_median"] = med

json.dump(stats, sys.stdout, indent=2)
print()
