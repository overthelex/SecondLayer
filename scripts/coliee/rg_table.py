#!/usr/bin/env python3
"""Recompute the coupling-metric table across every available ranker.

Until now RG was reported for BM25 only, because the July dense runs kept
aggregate metrics and not the ranked lists. With rankings_*.json present
(see dump_rankings.py / launch_rankings_sagemaker.py) the whole table can be
scored on the same footing: BM25, E5, BGE-M3, plus the two reference rankers
(query-independent popularity and the boilerplate ranker) that bound what the
metrics can be driven to.

    python scripts/coliee/rg_table.py --corpus ua --corpus ca
"""

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location(
    "rgm", os.path.join(HERE, "reachability_gain.py"))
rgm = importlib.util.module_from_spec(_spec)
sys.modules["rgm"] = rgm
_spec.loader.exec_module(rgm)
from retrieval_experiment import load_cases  # noqa: E402

DATA = "data/coliee/task1"
DENSE = [("e5", "e5"), ("bge-m3", "bgem3")]


def f1_at(ranked, gold, k):
    hit = sum(1 for x in ranked[:k] if x in gold)
    p, r = hit / k, hit / len(gold)
    return 2 * p * r / (p + r) if (p + r) else 0.0


def build(corpus, k):
    cfg = rgm.CORPORA[corpus]
    ids, texts, _, labels = load_cases(cfg["zip"], None, 4000, cfg["years_json"])
    qs = [q for q in labels if q in texts]
    cit = ({x: set(v) for x, v in json.load(open(cfg["citations_json"])).items()}
           if cfg["citations_json"] else {x: set(v) for x, v in labels.items()})
    pool = set(ids)
    df, citers = {}, {}
    for d, cs in cit.items():
        if d not in pool:
            continue
        for g in cs:
            if g in pool:
                df[g] = df.get(g, 0) + 1
                citers.setdefault(g, set()).add(d)

    rankers = {"BM25": rgm.bm25_ranking(ids, texts, qs)}
    for name, slug in DENSE:
        path = f"{DATA}/rankings_{corpus}_{slug}.json"
        if os.path.exists(path):
            rankers[name.upper()] = json.load(open(path))["rankings"]
        else:
            print(f"  (missing {path}, skipping {name})", file=sys.stderr)
    pop = sorted(ids, key=lambda c: (-df.get(c, 0), c))
    rankers["popularity"] = {q: [c for c in pop[:k + 1] if c != q][:k] for q in qs}
    att, full = rgm.boilerplate_ranking(qs, labels, cit, df, citers, ids, k=k)
    rankers["boilerplate"] = att

    def cand(q):
        g = set(labels.get(q, []))
        c = set(g)
        for x in g:
            c |= citers.get(x, set())
        c.discard(q)
        return c

    return ids, qs, labels, cit, df, rankers, cand, full


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", action="append", default=None)
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--alpha", type=float, default=0.5)
    ap.add_argument("--beta", type=float, default=0.25)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    corpora = args.corpus or ["ua", "ca"]

    report = {}
    for corpus in corpora:
        ids, qs, labels, cit, df, rankers, cand, full = build(corpus, args.k)
        rg = rgm.RG(cit, df, len(ids), alpha=args.alpha, beta=args.beta,
                    weight="idf", discount=True, normalize="ideal")
        print(f"\n{corpus.upper()}  pool={len(ids)}  queries={len(qs)}  "
              f"k={args.k}  (RG: alpha={args.alpha}, beta={args.beta}, IDF)")
        print(f"  {'ranker':14s} {'F1':>8s} {'Ext.P':>8s} {'Cov':>8s} {'RG':>8s}")
        rows = {}
        for name, R in rankers.items():
            n = len(qs)
            f1 = sum(f1_at(R[q][:args.k], set(labels[q]), args.k) for q in qs) / n
            e = sum(rgm.ext_p(R[q], set(labels[q]), cit, args.k) for q in qs) / n
            c = sum(rgm.coverage(R[q], set(labels[q]), cit, args.k) for q in qs) / n
            v = rg.score(qs, R, labels, args.k, cand)
            rows[name] = {"F1": round(f1, 4), "ExtP": round(e, 4),
                          "Cov": round(c, 4), "RG": round(v, 4)}
            print(f"  {name:14s} {f1:8.4f} {e:8.4f} {c:8.4f} {v:8.4f}")
        report[corpus] = {"queries": len(qs), "pool": len(ids),
                          "attackable_queries": full, "rankers": rows}

    if args.out:
        with open(args.out, "w") as fh:
            json.dump({"k": args.k, "alpha": args.alpha, "beta": args.beta,
                       "corpora": report}, fh, indent=2)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
