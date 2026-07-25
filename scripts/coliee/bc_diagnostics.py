#!/usr/bin/env python3
"""
Tier-0 diagnostics for the Sekiguchi/Yoshioka/Kwan (ICTIR '26) bibliographic-
coupling evaluation framework.

Three questions, all answerable on the data already in data/coliee/task1/:

  D1  Popularity floor. Yoshioka (email 2026-07-25) suggests that in a densely
      coupled corpus "simply checking the highly cited cases may be sufficient".
      We test it literally: rank the pool by in-pool in-degree, ignoring the
      query entirely, and score that query-independent list under Extended
      Precision and Coverage. Whatever a constant list scores is the floor the
      metric hands out for free.

  D2  Head vs tail. Yoshioka's second point: what matters for recall/coverage is
      reaching the *infrequently* cited cases. We decompose Coverage@k by the
      citation frequency (in-pool in-degree) of each gold case, so the metric
      stops averaging the head and the tail together.

  D3  How the BC (Silver) layer grows with pool size. Their §6 limitation is that
      the analysis is on a 1,870-case subset and that problems "become even more
      pronounced ... with large-scale databases". We hold queries and gold fixed
      and sweep the number of distractors, measuring how much of the pool becomes
      BC-eligible for an average query.

Retrieval side uses BM25 (CPU, no GPU, no model download) so the diagnostics are
reproducible anywhere; BM25 is already one of the three systems in the
cross-jurisdictional draft.

Usage:
    python scripts/coliee/bc_diagnostics.py --corpus ua
    python scripts/coliee/bc_diagnostics.py --corpus ca
"""

import argparse
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retrieval_experiment import bm25_sims, load_cases  # noqa: E402

DATA = "data/coliee/task1"

CORPORA = {
    "ua": {
        "zip": f"{DATA}/ua_case_retrieval.zip",
        "years_json": f"{DATA}/ua_years.json",
        "citations_json": f"{DATA}/ua_citations.json",
    },
    "ca": {
        "zip": f"{DATA}/task1_train_files_2026.zip",
        "years_json": None,
        "citations_json": None,  # COLIEE: noticed list IS the citation list
    },
}

K_VALUES = [1, 3, 5, 10]


# ----------------------------------------------------------------- metrics ---
def ext_p_and_cov(topk, gold, citations):
    """Sekiguchi et al. Extended Precision and Coverage for one query."""
    k = len(topk)
    hit = sum(1 for d in topk if d in gold or gold.intersection(citations.get(d, ())))
    tset = set(topk)
    covered = [g for g in gold
               if g in tset or any(g in citations.get(d, ()) for d in topk)]
    return hit / k, len(covered) / len(gold), set(covered)


def score_ranking(query_ids, ranked, labels, citations, k_values):
    out = {}
    for k in k_values:
        f1s = eps = covs = 0.0
        n = 0
        for q in query_ids:
            gold = set(labels.get(q, []))
            if not gold:
                continue
            topk = ranked[q][:k]
            hit = sum(1 for c in topk if c in gold)
            p, r = hit / k, hit / len(gold)
            f1s += 2 * p * r / (p + r) if (p + r) else 0.0
            e, c, _ = ext_p_and_cov(topk, gold, citations)
            eps += e
            covs += c
            n += 1
        out[f"k={k}"] = {"F1": round(f1s / n, 4), "ExtP": round(eps / n, 4),
                         "Cov": round(covs / n, 4), "queries": n}
    return out


# ------------------------------------------------------------------ D1 ------
def indegree(case_ids, citations):
    """In-pool in-degree: how many pool documents cite each case."""
    pool = set(case_ids)
    deg = {c: 0 for c in case_ids}
    for d, cited in citations.items():
        if d not in pool:
            continue
        for g in cited:
            if g in deg:
                deg[g] += 1
    return deg


def d1_popularity_floor(case_ids, query_ids, labels, citations, bm25_ranked, seed=42):
    deg = indegree(case_ids, citations)
    pop_order = sorted(case_ids, key=lambda c: (-deg[c], c))
    rng = random.Random(seed)
    rnd_order = case_ids[:]
    rng.shuffle(rnd_order)

    def constant_ranking(order):
        maxk = max(K_VALUES) + 1
        head = order[:maxk + 1]
        return {q: [c for c in head if c != q][:maxk] for q in query_ids}

    res = {
        "popularity_only": score_ranking(query_ids, constant_ranking(pop_order),
                                         labels, citations, K_VALUES),
        "random": score_ranking(query_ids, constant_ranking(rnd_order),
                                labels, citations, K_VALUES),
        "bm25": score_ranking(query_ids, bm25_ranked, labels, citations, K_VALUES),
    }
    res["_indegree"] = {
        "max": max(deg.values()),
        "mean": round(sum(deg.values()) / len(deg), 4),
        "cited_at_least_once": sum(1 for v in deg.values() if v),
        "pool": len(case_ids),
        "top10": [(c, deg[c]) for c in pop_order[:10]],
    }
    return res


# ------------------------------------------------------------------ D2 ------
BUCKETS = [(0, 0), (1, 1), (2, 3), (4, 9), (10, 10 ** 9)]
BUCKET_NAMES = ["df=0", "df=1", "df=2-3", "df=4-9", "df>=10"]


def bucket_of(df):
    for i, (lo, hi) in enumerate(BUCKETS):
        if lo <= df <= hi:
            return i
    return len(BUCKETS) - 1


def d2_head_vs_tail(case_ids, query_ids, labels, citations, rankings, k=5):
    """Per-gold reachability at k, bucketed by the gold case's in-pool df."""
    deg = indegree(case_ids, citations)
    out = {}
    for name, ranked in rankings.items():
        tot = [0] * len(BUCKETS)
        direct = [0] * len(BUCKETS)
        viabc = [0] * len(BUCKETS)
        for q in query_ids:
            gold = set(labels.get(q, []))
            if not gold:
                continue
            topk = ranked[q][:k]
            tset = set(topk)
            for g in gold:
                b = bucket_of(deg.get(g, 0))
                tot[b] += 1
                if g in tset:
                    direct[b] += 1
                elif any(g in citations.get(d, ()) for d in topk):
                    viabc[b] += 1
        out[name] = [
            {"bucket": BUCKET_NAMES[i], "gold_instances": tot[i],
             "share_of_gold": round(tot[i] / max(1, sum(tot)), 4),
             "direct_rate": round(direct[i] / tot[i], 4) if tot[i] else None,
             "bc_rate": round(viabc[i] / tot[i], 4) if tot[i] else None,
             "cov_rate": round((direct[i] + viabc[i]) / tot[i], 4) if tot[i] else None}
            for i in range(len(BUCKETS))
        ]
    return out


# ------------------------------------------------------------------ D3 ------
def d3_bc_layer_growth(case_ids, query_ids, labels, citations, fractions, seed=42):
    """How the Silver (BC) layer grows with the number of documents whose
    citation list is known.

    Adding *distractors* to the pool cannot create BC cases: a BC case is by
    definition a document with a known outgoing citation into the query's gold
    set. So the quantity that actually governs BC availability is |{d: Cite(d)
    known}|, which is exactly what COLIEE bounds (Cite(d) exists only for the
    labelled query cases). We subsample the citing-document set and measure how
    much of the BC layer becomes visible."""
    pool = set(case_ids)
    citing_docs = sorted(d for d in citations if d in pool and citations[d])
    rng = random.Random(seed)
    order = citing_docs[:]
    rng.shuffle(order)

    rows = []
    for frac in fractions:
        n_cite = max(1, int(round(frac * len(citing_docs))))
        visible = set(order[:n_cite])
        citers = {}
        for d in visible:
            for g in citations[d]:
                citers.setdefault(g, set()).add(d)
        bc_counts = []
        q_with_bc = 0
        for q in query_ids:
            gold = set(labels.get(q, [])) & pool
            if not gold:
                continue
            bc = set()
            for g in gold:
                bc |= citers.get(g, set())
            bc -= gold
            bc.discard(q)
            bc_counts.append(len(bc))
            q_with_bc += len(bc) > 0
        n = len(bc_counts)
        rows.append({
            "citing_docs_known": n_cite,
            "pct_of_pool_with_known_cite": round(100 * n_cite / len(pool), 2),
            "queries_scored": n,
            "queries_with_bc_pct": round(100 * q_with_bc / n, 2) if n else None,
            "mean_bc_per_query": round(sum(bc_counts) / n, 3) if n else None,
        })
    return rows


# ----------------------------------------------------------------- driver ---
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", choices=list(CORPORA), required=True)
    ap.add_argument("--max-chars", type=int, default=4000)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cfg = CORPORA[args.corpus]
    case_ids, texts, years, labels = load_cases(
        cfg["zip"], None, args.max_chars, cfg["years_json"])
    query_ids = [q for q in labels if q in texts]
    if cfg["citations_json"]:
        citations = {k: set(v) for k, v in json.load(open(cfg["citations_json"])).items()}
    else:
        citations = {k: set(v) for k, v in labels.items()}
    print(f"[{args.corpus}] pool={len(case_ids)} queries={len(query_ids)} "
          f"citing-docs={len(citations)}", flush=True)

    # BM25 rankings (shared by D1 and D2)
    print("running BM25 ...", flush=True)
    import numpy as np
    sims = bm25_sims(case_ids, texts, query_ids)
    idx = {c: i for i, c in enumerate(case_ids)}
    maxk = max(K_VALUES)
    for i, q in enumerate(query_ids):
        sims[i, idx[q]] = -1e9
    part = np.argpartition(-sims, maxk, axis=1)[:, :maxk]
    order = np.argsort(-np.take_along_axis(sims, part, axis=1), axis=1)
    top = np.take_along_axis(part, order, axis=1)
    bm25_ranked = {query_ids[i]: [case_ids[j] for j in top[i]]
                   for i in range(len(query_ids))}
    del sims

    deg = indegree(case_ids, citations)
    pop_order = sorted(case_ids, key=lambda c: (-deg[c], c))
    pop_ranked = {q: [c for c in pop_order[:maxk + 1] if c != q][:maxk]
                  for q in query_ids}

    out = {
        "corpus": args.corpus,
        "pool": len(case_ids),
        "queries": len(query_ids),
        "D1_popularity_floor": d1_popularity_floor(
            case_ids, query_ids, labels, citations, bm25_ranked),
        "D2_head_vs_tail_at5": d2_head_vs_tail(
            case_ids, query_ids, labels, citations,
            {"bm25": bm25_ranked, "popularity_only": pop_ranked}, k=5),
        "D3_bc_layer_growth": d3_bc_layer_growth(
            case_ids, query_ids, labels, citations,
            fractions=[0.05, 0.1, 0.25, 0.5, 0.75, 1.0]),
    }

    print(json.dumps(out, indent=2, ensure_ascii=False))
    if args.out:
        with open(args.out, "w") as fh:
            json.dump(out, fh, indent=2, ensure_ascii=False)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
