#!/usr/bin/env python3
"""
Reachability Gain (RG@k): one measure that contains the Sekiguchi/Yoshioka/Kwan
(ICTIR '26) Extended Precision and Coverage as corner cases.

Motivation. Yoshioka (email, 2026-07-25) asks for "a single evaluation measure
for considering the BC case". Their own §6 lists what such a measure must add:
context-based weighting, rank-awareness, and a penalty for redundant boilerplate
cases dominating the top. All three are standard machinery in the two literatures
their paper already cites (nugget-based evaluation and result diversification),
so the proposal is to assemble rather than invent.

Construction. Each gold case is a nugget. A retrieved document covers a nugget
either by being it (direct) or by citing it (one BC hop, the "one-click" pathway).

  credit    c_i(g) = 1                     if d_i = g
                   = beta * rho(d_i) * tau(dt)  if g in Cite(d_i)
                   = 0                     otherwise
  redundancy r_i(g) = |{ j < i : c_j(g) > 0 }|
  gain      gain_i = sum_g u(g) * c_i(g) * (1-alpha)^{r_i(g)}
  RG@k             = sum_{i<=k} gain_i / log2(1+i)   / ideal(k)

  u(g)    nugget weight, default IDF: log(N / df(g)), normalized to sum 1 over G_q.
          Rare gold is worth more than boilerplate gold. This is the single knob
          that fixes both the over-crediting of hub gold and the invisibility of
          the tail.
  beta    how much a one-click pathway is worth relative to the document itself.
          Not a free constant: it should be measured (LLM/expert audit of BC
          pairs), see the accompanying proposal.
  rho     citation-role factor (holding vs dissent vs overruled/rejected). Hook is
          implemented; on the 7.7K COLIEE-matched pool only 30 pool documents carry
          an instance-status label, so it is not exercisable here and needs a
          national-scale run.
  tau     temporal factor from the measured coupling-decay curve. Off by default.
  alpha   redundancy discount, the diversification dial.

The corner cases (verified numerically by --verify):

  Coverage       = alpha=1, beta=1, u=1/|G_q|, no rank discount, no normalization
  Ext. Precision = alpha=0, beta=1, document-level saturation, divide by k

So their two metrics are the two ends of one redundancy dial: Coverage counts a
nugget once however many times it is reachable (alpha=1), Extended Precision
credits every pathway in full however redundant (alpha=0). The interesting
operating point is in between.

Usage:
    python scripts/coliee/reachability_gain.py --corpus ua --verify
    python scripts/coliee/reachability_gain.py --corpus ca
"""

import argparse
import csv
import gzip
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retrieval_experiment import bm25_sims, load_cases  # noqa: E402

DATA = "data/coliee/task1"
# Optional EDRSR instance-status export (edrsr_overruled.csv.gz,
# edrsr_dissent.csv.gz) used for the citation-role factor rho. Point
# ISL_EXPORT_DIR at it to enable; without it every pathway is treated as
# role "holding", which is what the published figures use.
ISL = os.environ.get("ISL_EXPORT_DIR", "")

CORPORA = {
    "ua": {"zip": f"{DATA}/ua_case_retrieval.zip",
           "years_json": f"{DATA}/ua_years.json",
           "citations_json": f"{DATA}/ua_citations.json"},
    "ca": {"zip": f"{DATA}/task1_train_files_2026.zip",
           "years_json": None, "citations_json": None},
}


# ------------------------------------------------------------ the measure ---
class RG:
    def __init__(self, citations, df, n_pool, alpha=0.5, beta=0.5,
                 weight="idf", discount=True, normalize="ideal",
                 saturate_doc=False, roles=None, rho=None,
                 years=None, tau=None):
        self.cit = citations
        self.df = df
        self.N = n_pool
        self.alpha = alpha
        self.beta = beta
        self.weight = weight
        self.discount = discount
        self.normalize = normalize
        self.saturate_doc = saturate_doc
        self.roles = roles or {}
        self.rho = rho or {}
        self.years = years or {}
        self.tau = tau          # {gap: factor}, empirical coupling-decay curve
        self._q = None          # current query, for the temporal factor

    def _u(self, gold):
        if self.weight == "uniform":
            return {g: 1.0 / len(gold) for g in gold}
        w = {g: math.log(self.N / max(1, self.df.get(g, 0) or 1)) for g in gold}
        s = sum(w.values()) or 1.0
        return {g: v / s for g, v in w.items()}

    def _credit(self, d, g):
        """Credit document d gives to nugget g."""
        if d == g:
            return 1.0
        if g in self.cit.get(d, ()):
            c = self.beta * self.rho.get(self.roles.get(d, "holding"), 1.0)
            if self.tau is not None and self._q is not None:
                yq, yd = self.years.get(self._q), self.years.get(d)
                if yq is not None and yd is not None:
                    gap = abs(int(yq) - int(yd))
                    c *= self.tau.get(gap, self.tau[max(self.tau)])
            return c
        return 0.0

    def _dcg(self, ranked, gold, u, k):
        seen = {g: 0 for g in gold}
        total = 0.0
        for i, d in enumerate(ranked[:k], start=1):
            if self.saturate_doc:
                gain = 1.0 if any(self._credit(d, g) > 0 for g in gold) else 0.0
            else:
                gain = 0.0
                for g in gold:
                    c = self._credit(d, g)
                    if c > 0:
                        gain += u[g] * c * (1.0 - self.alpha) ** seen[g]
            for g in gold:
                if self._credit(d, g) > 0:
                    seen[g] += 1
            total += gain / math.log2(1 + i) if self.discount else gain
        return total

    def _ideal(self, gold, u, k, candidates):
        """Greedy ideal ranking over the documents that can cover anything."""
        seen = {g: 0 for g in gold}
        chosen, total = [], 0.0
        pool = list(candidates)
        for i in range(1, k + 1):
            best, best_gain = None, -1.0
            for d in pool:
                if d in chosen:
                    continue
                if self.saturate_doc:
                    gain = 1.0 if any(self._credit(d, g) > 0 for g in gold) else 0.0
                else:
                    gain = sum(u[g] * self._credit(d, g) * (1 - self.alpha) ** seen[g]
                               for g in gold if self._credit(d, g) > 0)
                if gain > best_gain:
                    best, best_gain = d, gain
            if best is None or best_gain <= 0:
                break
            chosen.append(best)
            for g in gold:
                if self._credit(best, g) > 0:
                    seen[g] += 1
            total += best_gain / math.log2(1 + i) if self.discount else best_gain
        return total

    def score(self, query_ids, ranked, labels, k, candidates_of=None):
        vals = []
        for q in query_ids:
            gold = set(labels.get(q, []))
            if not gold:
                continue
            self._q = q
            u = self._u(gold)
            v = self._dcg(ranked[q], gold, u, k)
            if self.normalize == "k":
                v /= k
            elif self.normalize == "ideal":
                cand = candidates_of(q) if candidates_of else set()
                ideal = self._ideal(gold, u, k, cand)
                v = v / ideal if ideal > 0 else 0.0
            vals.append(v)
        return sum(vals) / len(vals) if vals else None


# ------------------------------------------------------------- reference ----
def ext_p(ranked, gold, cit, k):
    topk = ranked[:k]
    return sum(1 for d in topk
               if d in gold or gold.intersection(cit.get(d, ()))) / k


def coverage(ranked, gold, cit, k):
    topk = ranked[:k]
    ts = set(topk)
    return sum(1 for g in gold
               if g in ts or any(g in cit.get(d, ()) for d in topk)) / len(gold)


# ------------------------------------------------------------- rankers ------
def bm25_ranking(case_ids, texts, query_ids, depth=10):
    import numpy as np
    sims = bm25_sims(case_ids, texts, query_ids)
    idx = {c: i for i, c in enumerate(case_ids)}
    for i, q in enumerate(query_ids):
        sims[i, idx[q]] = -1e9
    part = np.argpartition(-sims, depth, axis=1)[:, :depth]
    order = np.argsort(-np.take_along_axis(sims, part, axis=1), axis=1)
    top = np.take_along_axis(part, order, axis=1)
    return {query_ids[i]: [case_ids[j] for j in top[i]]
            for i in range(len(query_ids))}


def boilerplate_ranking(query_ids, labels, cit, df, citers, pool, k=5):
    """Adversarial ranker: return k documents that all reach the SAME, most
    heavily cited gold case. This is the failure mode their §6 names (redundant
    boilerplate dominating the top) in its purest form."""
    ranked, full = {}, 0
    for q in query_ids:
        gold = set(labels.get(q, []))
        if not gold:
            continue
        g_star = max(sorted(gold), key=lambda g: df.get(g, 0))
        cands = [d for d in citers.get(g_star, ()) if d != q and d not in gold]
        cands.sort(key=lambda d: (-df.get(d, 0), d))   # doc id breaks ties -> deterministic
        lst = cands[:k]
        if len(lst) >= k:
            full += 1
        if len(lst) < k:                       # pad with other BC documents
            extra = []
            for g in sorted(gold):
                extra += sorted((d for d in citers.get(g, ())
                                 if d != q and d not in gold and d not in lst),
                                key=lambda d: (-df.get(d, 0), d))
            lst = (lst + extra)[:k]
        if len(lst) < k:                       # then with global hubs
            hubs = sorted(pool, key=lambda d: -df.get(d, 0))
            lst = (lst + [d for d in hubs if d != q and d not in lst])[:k]
        ranked[q] = lst
    return ranked, full


# --------------------------------------------------------------- driver -----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", choices=list(CORPORA), required=True)
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--alpha", type=float, default=0.5)
    ap.add_argument("--beta", type=float, default=0.5)
    ap.add_argument("--verify", action="store_true",
                    help="assert the corner cases reproduce ExtP and Coverage")
    ap.add_argument("--max-chars", type=int, default=4000)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cfg = CORPORA[args.corpus]
    case_ids, texts, years, labels = load_cases(
        cfg["zip"], None, args.max_chars, cfg["years_json"])
    query_ids = [q for q in labels if q in texts]
    if cfg["citations_json"]:
        cit = {k: set(v) for k, v in json.load(open(cfg["citations_json"])).items()}
    else:
        cit = {k: set(v) for k, v in labels.items()}
    pool = set(case_ids)

    df, citers = {}, {}
    for d, cs in cit.items():
        if d not in pool:
            continue
        for g in cs:
            if g in pool:
                df[g] = df.get(g, 0) + 1
                citers.setdefault(g, set()).add(d)

    # roles from the EDRSR instance-status layer (UA only, hook demo)
    roles = {}
    if args.corpus == "ua" and os.path.isdir(ISL):
        with gzip.open(ISL + "edrsr_overruled.csv.gz", "rt") as fh:
            for r in csv.DictReader(fh):
                n = r["doc_id"] + ".txt"
                if n in pool:
                    roles[n] = "overruled_lower"
        with gzip.open(ISL + "edrsr_dissent.csv.gz", "rt") as fh:
            for r in csv.DictReader(fh):
                n = r["dissent_doc_id"] + ".txt"
                if n in pool:
                    roles[n] = "dissent"
    RHO = {"holding": 1.0, "overruled_lower": 0.0, "dissent": 0.25}

    def candidates_of(q):
        gold = set(labels.get(q, []))
        c = set(gold)
        for g in gold:
            c |= citers.get(g, set())
        c.discard(q)
        return c

    print(f"[{args.corpus}] pool={len(case_ids)} queries={len(query_ids)} "
          f"k={args.k} | role-labelled pool docs={len(roles)}", flush=True)

    rankings = {"bm25": bm25_ranking(case_ids, texts, query_ids)}
    pop_order = sorted(case_ids, key=lambda c: (-df.get(c, 0), c))
    rankings["popularity"] = {q: [c for c in pop_order[:11] if c != q][:10]
                              for q in query_ids}
    boiler, full = boilerplate_ranking(query_ids, labels, cit, df, citers,
                                       case_ids, k=args.k)
    rankings["boilerplate_attack"] = boiler
    print(f"boilerplate attack: {full}/{len(query_ids)} queries admit a full "
          f"{args.k}-document single-gold pathway set", flush=True)

    # ---------------------------------------------------------- verify -----
    if args.verify:
        cov_rg = RG(cit, df, len(case_ids), alpha=1.0, beta=1.0, weight="uniform",
                    discount=False, normalize=None)
        ext_rg = RG(cit, df, len(case_ids), alpha=0.0, beta=1.0, weight="uniform",
                    discount=False, normalize="k", saturate_doc=True)
        for name, ranked in rankings.items():
            ref_c = sum(coverage(ranked[q], set(labels[q]), cit, args.k)
                        for q in query_ids if labels.get(q)) / len(query_ids)
            ref_e = sum(ext_p(ranked[q], set(labels[q]), cit, args.k)
                        for q in query_ids if labels.get(q)) / len(query_ids)
            got_c = cov_rg.score(query_ids, ranked, labels, args.k)
            got_e = ext_rg.score(query_ids, ranked, labels, args.k)
            assert abs(ref_c - got_c) < 1e-9, (name, "Coverage", ref_c, got_c)
            assert abs(ref_e - got_e) < 1e-9, (name, "ExtP", ref_e, got_e)
            print(f"  corner check [{name:20s}] Coverage {ref_c:.6f} == {got_c:.6f}"
                  f"   ExtP {ref_e:.6f} == {got_e:.6f}   OK")

    # ------------------------------------------------------- main table ----
    rg = RG(cit, df, len(case_ids), alpha=args.alpha, beta=args.beta,
            weight="idf", discount=True, normalize="ideal",
            roles=roles, rho=RHO)
    rg_norole = RG(cit, df, len(case_ids), alpha=args.alpha, beta=args.beta,
                   weight="idf", discount=True, normalize="ideal")
    rows = {}
    print(f"\n{'ranker':22s} {'F1@k':>8s} {'ExtP@k':>8s} {'Cov@k':>8s} "
          f"{'RG@k':>8s} {'RG(role)':>9s}")
    for name, ranked in rankings.items():
        f1 = 0.0
        for q in query_ids:
            gold = set(labels.get(q, []))
            if not gold:
                continue
            hit = sum(1 for c in ranked[q][:args.k] if c in gold)
            p, r = hit / args.k, hit / len(gold)
            f1 += 2 * p * r / (p + r) if (p + r) else 0.0
        f1 /= len(query_ids)
        e = sum(ext_p(ranked[q], set(labels[q]), cit, args.k)
                for q in query_ids if labels.get(q)) / len(query_ids)
        c = sum(coverage(ranked[q], set(labels[q]), cit, args.k)
                for q in query_ids if labels.get(q)) / len(query_ids)
        v = rg_norole.score(query_ids, ranked, labels, args.k, candidates_of)
        vr = rg.score(query_ids, ranked, labels, args.k, candidates_of)
        rows[name] = {"F1": round(f1, 4), "ExtP": round(e, 4), "Cov": round(c, 4),
                      "RG": round(v, 4), "RG_role": round(vr, 4)}
        print(f"{name:22s} {f1:8.4f} {e:8.4f} {c:8.4f} {v:8.4f} {vr:9.4f}")

    # -------------------------------------------------------- sensitivity --
    print(f"\nsensitivity (BM25 vs boilerplate attack), RG@{args.k}:")
    print(f"  {'alpha':>6s} {'beta':>6s} {'RG bm25':>9s} {'RG attack':>10s} {'ratio':>7s}")
    sens = []
    for alpha in (0.0, 0.25, 0.5, 0.75, 1.0):
        for beta in (0.25, 0.5, 1.0):
            m = RG(cit, df, len(case_ids), alpha=alpha, beta=beta, weight="idf",
                   discount=True, normalize="ideal")
            a = m.score(query_ids, rankings["bm25"], labels, args.k, candidates_of)
            b = m.score(query_ids, rankings["boilerplate_attack"], labels,
                        args.k, candidates_of)
            sens.append({"alpha": alpha, "beta": beta, "bm25": round(a, 4),
                         "attack": round(b, 4)})
            print(f"  {alpha:6.2f} {beta:6.2f} {a:9.4f} {b:10.4f} "
                  f"{(b / a if a else float('nan')):7.2f}")

    if args.out:
        with open(args.out, "w") as fh:
            json.dump({"corpus": args.corpus, "k": args.k,
                       "alpha": args.alpha, "beta": args.beta,
                       "rankers": rows, "sensitivity": sens,
                       "role_labelled_pool_docs": len(roles)}, fh, indent=2)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
