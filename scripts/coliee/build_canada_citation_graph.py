#!/usr/bin/env python3
"""
Canadian-side pilot for extending arXiv:2605.17639
("Temporal Decay of Co-Citation Predictability") to a second jurisdiction
using the COLIEE 2026 Task 1 (Legal Case Retrieval) corpus.

Given the Task 1 train zip (Canadian Federal Court decisions + a labels JSON
mapping each query case -> its "noticed"/cited cases), this builds a dated
case->case citation graph and computes, with the standard library only:

  1. decision-date parsing + coverage
  2. graph size / out-degree (citations per case)
  3. citation-age distribution (citing_year - cited_year)
  4. bibliographic coupling (query cases sharing noticed cases)
     and co-citation (cases noticed together by a common query)
  5. a Mann-Kendall trend test on mean citation age per citing-year
     (the temporal-decay signal the paper measures on the Ukrainian graph)

Dense retrieval (E5 / BGE-M3) + exp recency-weighting is intentionally left
as a follow-up step (needs GPU + the retrieval eval harness); this script
produces the graph statistics you can bring to the call.

Usage:
    python scripts/coliee/build_canada_citation_graph.py \
        --zip data/coliee/task1/task1_train_files_2026.zip \
        [--labels task1_train_files_2026/clean_task1_train_labels_2026.json] \
        [--out data/coliee/task1/ca_graph_stats.json]

No third-party dependencies.
"""

import argparse
import json
import math
import re
import statistics
import sys
import zipfile
from collections import Counter, defaultdict

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}
_DATE_RE = re.compile(
    r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")

# The Federal Court of Canada was established in 1971; the Task 1 corpus is
# Federal Court decisions, so any parsed "decision year" before that is a
# mis-parse (a reviewed-tribunal date, a footnote/statute year, an OCR blob).
FC_MIN_YEAR = 1971


def parse_year(text: str, max_year: int = 2026):
    """Best-effort decision year from a case text.

    The judgment date is the *latest* real event in the header: a decision
    cannot post-date itself, and the header often also carries an *earlier*
    date (the reviewed-tribunal decision, e.g. "the March 2, 2005 decision
    of the Board"). So among the plausible 'Month DD, YYYY' dates in the
    header block we take the **maximum** year, clamped to [FC_MIN_YEAR,
    max_year]. Fall back to the max plausible bare year token.
    """
    head = text[:2500]
    cand = [
        int(m.group(3)) for m in _DATE_RE.finditer(head)
        if FC_MIN_YEAR <= int(m.group(3)) <= max_year
    ]
    if cand:
        return max(cand)
    yrs = [
        int(y) for y in _YEAR_RE.findall(head)
        if FC_MIN_YEAR <= int(y) <= max_year
    ]
    if yrs:
        return max(yrs)
    return None


def load_corpus(zip_path: str, labels_arcname: str | None):
    """Return (years: {case_id -> year}, labels: {query_id -> [noticed_id...]}).

    case_id is the bare file name (e.g. '000378.txt') to match the labels JSON.
    """
    years: dict[str, int] = {}
    labels: dict[str, list[str]] = {}

    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()

        # locate the labels JSON if not given explicitly
        if labels_arcname is None:
            cand = [n for n in names if n.endswith(".json") and "label" in n.lower()]
            if not cand:
                sys.exit("No labels JSON found in the zip; pass --labels explicitly.")
            labels_arcname = sorted(cand, key=len)[0]
        with zf.open(labels_arcname) as fh:
            labels = json.load(fh)
        print(f"labels file: {labels_arcname}  ({len(labels)} query cases)")

        case_members = [n for n in names if "/cases/" in n and n.endswith(".txt")]
        for n in case_members:
            case_id = n.rsplit("/", 1)[-1]
            with zf.open(n) as fh:
                text = fh.read().decode("utf-8", errors="replace")
            y = parse_year(text)
            if y is not None:
                years[case_id] = y

        print(f"case files: {len(case_members)}  |  dated: {len(years)} "
              f"({100.0 * len(years) / max(1, len(case_members)):.1f}%)")

    return years, labels


def mann_kendall(series: list[float]):
    """Two-sided Mann-Kendall trend test (normal approximation with tie
    correction). Returns dict with S, tau, z, p, trend."""
    n = len(series)
    if n < 3:
        return {"n": n, "trend": "insufficient-data"}
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            s += (series[j] > series[i]) - (series[j] < series[i])

    # variance with ties
    ties = Counter(series)
    tie_term = sum(t * (t - 1) * (2 * t + 5) for t in ties.values())
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0

    if s > 0:
        z = (s - 1) / math.sqrt(var_s) if var_s > 0 else 0.0
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s) if var_s > 0 else 0.0
    else:
        z = 0.0

    p = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    denom = 0.5 * n * (n - 1)
    tau = s / denom if denom else 0.0
    trend = "no-trend"
    if p < 0.05:
        trend = "increasing" if s > 0 else "decreasing"
    return {"n": n, "S": s, "tau": round(tau, 4), "z": round(z, 3),
            "p": round(p, 5), "trend": trend}


def analyze(years, labels, top_n=15, min_year_n=10):
    stats: dict = {}

    # ---- graph size + out-degree ----
    edges = []  # (query_id, noticed_id)
    out_deg = {}
    for q, noticed in labels.items():
        out_deg[q] = len(noticed)
        for n in noticed:
            edges.append((q, n))
    stats["query_cases"] = len(labels)
    stats["edges"] = len(edges)
    stats["mean_citations_per_query"] = round(statistics.mean(out_deg.values()), 2) if out_deg else 0
    stats["median_citations_per_query"] = statistics.median(out_deg.values()) if out_deg else 0
    stats["max_citations_per_query"] = max(out_deg.values()) if out_deg else 0

    # ---- citation-age distribution (needs both endpoints dated) ----
    # A valid citation cannot point to a future case, so age >= 0. We keep the
    # negative fraction only as a residual date-quality flag and compute the
    # actual age stats on valid (non-negative) edges.
    ages_all = []
    for q, n in edges:
        if q in years and n in years:
            ages_all.append(years[q] - years[n])
    ages = [a for a in ages_all if a >= 0]
    stats["edges_both_dated"] = len(ages_all)
    stats["edges_valid_age"] = len(ages)
    if ages_all:
        stats["citation_age_negative_frac"] = round(
            sum(a < 0 for a in ages_all) / len(ages_all), 4)  # residual QC flag
    if ages:
        stats["citation_age_mean"] = round(statistics.mean(ages), 2)
        stats["citation_age_median"] = statistics.median(ages)
        stats["citation_age_p90"] = sorted(ages)[int(0.9 * (len(ages) - 1))]
        stats["citation_age_hist"] = [
            {"age": a, "count": c} for a, c in sorted(Counter(ages).items())]

    # ---- bibliographic coupling: query pairs sharing noticed cases ----
    cited_by = defaultdict(list)  # noticed_id -> [query ...]
    for q, n in edges:
        cited_by[n].append(q)
    coupling = Counter()  # frozenset({q1,q2}) -> shared noticed count
    for n, qs in cited_by.items():
        uq = sorted(set(qs))
        for i in range(len(uq)):
            for j in range(i + 1, len(uq)):
                coupling[(uq[i], uq[j])] += 1
    stats["coupling_pairs"] = len(coupling)
    if coupling:
        cvals = list(coupling.values())
        stats["coupling_strength_mean"] = round(statistics.mean(cvals), 3)
        stats["coupling_strength_max"] = max(cvals)
        stats["coupling_strength_hist"] = [
            {"strength": s, "count": c} for s, c in sorted(Counter(cvals).items())]
        stats["coupling_top"] = [
            {"pair": list(p), "shared": s}
            for p, s in coupling.most_common(top_n)
        ]

    # ---- co-citation: cases noticed together by a common query ----
    cocit = Counter()
    for q, noticed in labels.items():
        un = sorted(set(noticed))
        for i in range(len(un)):
            for j in range(i + 1, len(un)):
                cocit[(un[i], un[j])] += 1
    stats["cocitation_pairs"] = len(cocit)
    if cocit:
        stats["cocitation_strength_mean"] = round(statistics.mean(cocit.values()), 3)
        stats["cocitation_strength_max"] = max(cocit.values())

    # ---- most-cited (in-degree) ----
    indeg = Counter({n: len(qs) for n, qs in cited_by.items()})
    stats["most_cited"] = [{"case": c, "in_degree": d} for c, d in indeg.most_common(top_n)]

    # ---- temporal-decay signal: mean citation age per citing-year ----
    # Only valid (age >= 0) edges; only citing-years with >= min_year_n edges
    # enter the trend series, so the Mann-Kendall test is not driven by
    # 1-3-sample early years.
    per_year_ages = defaultdict(list)
    for q, n in edges:
        if q in years and n in years and years[q] - years[n] >= 0:
            per_year_ages[years[q]].append(years[q] - years[n])
    yearly = sorted(
        (y, statistics.mean(a), len(a))
        for y, a in per_year_ages.items() if len(a) >= min_year_n
    )
    stats["min_year_n"] = min_year_n
    stats["mean_age_by_citing_year"] = [
        {"year": y, "mean_age": round(a, 2), "n": nn} for y, a, nn in yearly
    ]
    stats["mann_kendall_mean_age_trend"] = mann_kendall([a for _, a, _ in yearly])

    return stats


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", required=True, help="Task 1 train zip path")
    ap.add_argument("--labels", default=None,
                    help="labels arcname inside the zip (auto-detected if omitted)")
    ap.add_argument("--out", default=None, help="write full stats JSON here")
    ap.add_argument("--top", type=int, default=15, help="top-N lists to keep")
    ap.add_argument("--min-year-n", type=int, default=10,
                    help="min edges in a citing-year for it to enter the trend test")
    args = ap.parse_args()

    years, labels = load_corpus(args.zip, args.labels)
    stats = analyze(years, labels, top_n=args.top, min_year_n=args.min_year_n)

    # console summary
    print("\n===== Canadian citation-graph pilot (COLIEE Task 1) =====")
    for k in ("query_cases", "edges", "edges_both_dated", "edges_valid_age",
              "mean_citations_per_query", "median_citations_per_query",
              "max_citations_per_query", "citation_age_mean", "citation_age_median",
              "citation_age_p90", "citation_age_negative_frac",
              "coupling_pairs", "coupling_strength_mean", "coupling_strength_max",
              "cocitation_pairs", "cocitation_strength_mean", "cocitation_strength_max"):
        if k in stats:
            print(f"  {k:32s}: {stats[k]}")
    mk = stats.get("mann_kendall_mean_age_trend", {})
    print(f"  {'MK mean-age trend':32s}: {mk}")
    print("\n  mean citation age by citing-year:")
    for row in stats.get("mean_age_by_citing_year", []):
        print(f"    {row['year']}: age={row['mean_age']:5.2f}  (n={row['n']})")

    if args.out:
        with open(args.out, "w") as fh:
            json.dump(stats, fh, indent=2)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
