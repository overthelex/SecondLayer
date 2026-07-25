#!/usr/bin/env python3
"""
Retrieval experiment scaffold for the Canadian side of arXiv:2605.17639
("Temporal Decay of Co-Citation Predictability"), on the COLIEE 2026 Task 1
(Legal Case Retrieval) corpus.

Pipeline (mirrors the two dense models used in the paper):
  1. embed every case with E5 (intfloat/multilingual-e5-large) and BGE-M3
     (BAAI/bge-m3), first-stage dense retrieval over the whole corpus;
  2. for each query case, rank all other cases by cosine similarity and
     score against the gold "noticed" set -> Precision/Recall/F1@K;
  3. apply the paper's exp recency-weighting rerank
        score' = cos_sim * exp(-lambda * max(0, citing_year - cand_year))
     and sweep lambda to see whether the 3-23% gain seen on the Ukrainian
     graph replicates in Canadian common law.

This is a SCAFFOLD: heavy step (needs `sentence-transformers` + torch, a GPU
is strongly recommended, and it downloads ~2-2.5GB of model weights). Dates
are parsed with the same hardened parser as build_canada_citation_graph.py.

Quick smoke test (subset, tiny):
    python scripts/coliee/retrieval_experiment.py \
        --zip data/coliee/task1/task1_train_files_2026.zip \
        --models e5 --limit 50 --max-chars 3000

Full run:
    python scripts/coliee/retrieval_experiment.py \
        --zip data/coliee/task1/task1_train_files_2026.zip \
        --models e5 bge-m3 \
        --out data/coliee/task1/retrieval_results.json
"""

import argparse
import json
import os
import sys
import zipfile

# reuse the hardened date parser from the sibling graph script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_canada_citation_graph import parse_year  # noqa: E402

MODELS = {
    "e5": {
        "hf": "intfloat/multilingual-e5-large",
        "query_prefix": "query: ",
        "passage_prefix": "passage: ",
        "max_seq_length": 512,
    },
    "bge-m3": {
        "hf": "BAAI/bge-m3",
        "query_prefix": "",
        "passage_prefix": "",
        "max_seq_length": 1024,  # bge-m3 supports up to 8192; cap for speed
    },
    "bm25": {"hf": None},  # sparse lexical baseline (no embedding model)
}


def _tokenize(t):
    import re
    return re.findall(r"\w+", t.lower(), re.UNICODE)  # \w is Unicode -> Cyrillic ok


def bm25_sims(case_ids, texts, query_ids, k1=1.5, b=0.75):
    """Dense (Q x N) BM25 score matrix, vectorized as a sparse matmul
    Q_binary (Q x V) @ DocWeight (V x N). Unicode tokenization -> Ukrainian and
    English alike. Needs numpy + scipy."""
    import numpy as np
    from collections import Counter
    from scipy import sparse
    N = len(case_ids)
    tf = [Counter(_tokenize(texts[c])) for c in case_ids]
    dl = np.array([sum(c.values()) for c in tf], dtype="float64")
    avgdl = float(dl.mean()) if N else 1.0
    vocab = {}
    for c in tf:
        for t in c:
            if t not in vocab:
                vocab[t] = len(vocab)
    V = len(vocab)
    rows, cols, data = [], [], []               # (term, doc, tf)
    for di, c in enumerate(tf):
        for t, f in c.items():
            rows.append(vocab[t]); cols.append(di); data.append(f)
    rows = np.asarray(rows); cols = np.asarray(cols)
    data = np.asarray(data, dtype="float64")
    df = np.zeros(V)
    np.add.at(df, rows, 1.0)
    idf = np.log(1 + (N - df + 0.5) / (df + 0.5))
    denom = data + k1 * (1 - b + b * dl[cols] / avgdl)
    w = idf[rows] * (data * (k1 + 1)) / denom    # per (term,doc) BM25 weight
    DW = sparse.csr_matrix((w, (rows, cols)), shape=(V, N))
    qr, qc = [], []                              # query x term (binary presence)
    for qi, q in enumerate(query_ids):
        for t in set(_tokenize(texts[q])):
            ti = vocab.get(t)
            if ti is not None:
                qr.append(qi); qc.append(ti)
    Q = sparse.csr_matrix((np.ones(len(qr)), (qr, qc)),
                          shape=(len(query_ids), V))
    return (Q @ DW).toarray().astype("float32")


def per_query_metrics(query_ids, ranked, labels, citations, k):
    """Per-query F1@k (and Yoshioka ExtP/Cov@k) for bootstrap CIs / significance."""
    recs = []
    for q in query_ids:
        gold = set(labels.get(q, []))
        if not gold:
            continue
        topk = ranked[q][:k]
        hit = sum(1 for c in topk if c in gold)
        prec, rec = hit / k, hit / len(gold)
        r = {"f1": 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0}
        if citations is not None:
            h = sum(1 for d in topk
                    if d in gold or gold.intersection(citations.get(d, ())))
            tset = set(topk)
            cov = sum(1 for g in gold if g in tset
                      or any(g in citations.get(d, ()) for d in topk)) / len(gold)
            r["extp"], r["cov"] = h / k, cov
        recs.append(r)
    return recs


def load_cases(zip_path, labels_arcname, max_chars, years_json=None):
    """Return (case_ids, texts, years, labels).

    texts is truncated to max_chars (dense encoders cap at a few hundred
    tokens anyway; the head of a Federal Court decision carries the issue,
    parties, and holding — enough signal for a first-stage pilot).

    Decision years come from parse_year over the text (Canadian format). For
    corpora whose dates are not parseable that way (e.g. Ukrainian texts),
    pass years_json = a {case_id: year} mapping and text parsing is skipped."""
    ext_years = None
    if years_json:
        with open(years_json) as fh:
            ext_years = {k: int(v) for k, v in json.load(fh).items()}
    texts, years = {}, {}
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        if labels_arcname is None:
            cand = [n for n in names if n.endswith(".json") and "label" in n.lower()]
            labels_arcname = sorted(cand, key=len)[0]
        with zf.open(labels_arcname) as fh:
            labels = json.load(fh)
        for n in names:
            if "/cases/" in n and n.endswith(".txt"):
                cid = n.rsplit("/", 1)[-1]
                raw = zf.open(n).read().decode("utf-8", errors="replace")
                texts[cid] = raw[:max_chars]
                y = ext_years.get(cid) if ext_years is not None else parse_year(raw)
                if y is not None:
                    years[cid] = y
    case_ids = sorted(texts)
    return case_ids, texts, years, labels


def prf_at_k(ranked_ids, gold, k):
    """Precision/Recall/F1 for the top-k retrieved ids against gold set."""
    if not gold:
        return None
    topk = ranked_ids[:k]
    hit = sum(1 for c in topk if c in gold)
    prec = hit / k
    rec = hit / len(gold)
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return prec, rec, f1


def evaluate(query_ids, ranked_by_query, labels, k_values, citations=None):
    """Macro-averaged P/R/F1 and, when a citations map is given, the
    Yoshioka et al. (ICTIR 2026) bibliographic-coupling metrics.

    A candidate d is a bibliographic-coupling ("BC" / Silver) case for query q
    when it shares a gold case with q, i.e. Cite(d) ∩ G_q != {}. Extended
    Precision = fraction of the top-k that are gold OR BC; Coverage = fraction
    of gold cases reachable from the top-k directly or via one BC hop.
    citations maps case_id -> iterable of cited case_ids (Cite(d))."""
    out = {}
    for k in k_values:
        ps = rs = fs = eps = covs = 0.0
        n = 0
        for q in query_ids:
            gold = set(labels.get(q, []))
            if not gold:
                continue
            ranked = ranked_by_query[q]
            r = prf_at_k(ranked, gold, k)
            if r is None:
                continue
            p, rec, f1 = r
            ps += p; rs += rec; fs += f1
            if citations is not None:
                topk = ranked[:k]
                hit = sum(1 for d in topk
                          if d in gold or gold.intersection(citations.get(d, ())))
                eps += hit / k
                tset = set(topk)
                covered = sum(1 for g in gold if g in tset
                              or any(g in citations.get(d, ()) for d in topk))
                covs += covered / len(gold)
            n += 1
        if n:
            rec_out = {"P": round(ps / n, 4), "R": round(rs / n, 4),
                       "F1": round(fs / n, 4), "queries": n}
            if citations is not None:
                rec_out["ExtP"] = round(eps / n, 4)   # Yoshioka Extended Precision
                rec_out["Cov"] = round(covs / n, 4)   # Yoshioka Coverage
            out[f"k={k}"] = rec_out
    return out


def run_model(model_key, case_ids, texts, years, labels, query_ids,
              k_values, lambdas, batch_size, devices, citations=None,
              per_query_k=None):
    import numpy as np

    cfg = MODELS[model_key]
    if model_key == "bm25":
        print(f"\n### bm25 (lexical) on {len(case_ids)} docs", flush=True)
        sims = bm25_sims(case_ids, texts, query_ids)
    else:
        from sentence_transformers import SentenceTransformer
        print(f"\n### {model_key} ({cfg['hf']}) on {len(devices)} device(s)", flush=True)
        model = SentenceTransformer(cfg["hf"])
        model.max_seq_length = cfg["max_seq_length"]

        def encode(texts_list):
            if len(devices) > 1:
                pool = model.start_multi_process_pool(target_devices=devices)
                try:
                    emb = model.encode_multi_process(
                        texts_list, pool, batch_size=batch_size,
                        normalize_embeddings=True)
                finally:
                    model.stop_multi_process_pool(pool)
                return np.asarray(emb, dtype="float32")
            emb = model.encode(texts_list, batch_size=batch_size,
                               normalize_embeddings=True, show_progress_bar=False,
                               device=devices[0])
            return np.asarray(emb, dtype="float32")

        pool_emb = encode([cfg["passage_prefix"] + texts[c] for c in case_ids])
        q_emb = encode([cfg["query_prefix"] + texts[q] for q in query_ids])
        sims = q_emb @ pool_emb.T  # (Q x N) cosine (embeddings normalized)

    idx = {c: i for i, c in enumerate(case_ids)}

    # ---- vectorized recency rerank (no Python per-candidate loop) ----
    cand_years = np.array([years.get(c, -1) for c in case_ids], dtype="int32")
    has_year = cand_years >= 0
    q_year = np.array([years.get(q, -1) for q in query_ids], dtype="int32")
    self_col = np.array([idx[q] for q in query_ids])
    rows = np.arange(len(query_ids))
    maxk = min(max(k_values), len(case_ids) - 1)

    def ranked_for(lam):
        S = sims.copy()
        S[rows, self_col] = -1e9  # exclude self
        if lam > 0:
            age = q_year[:, None] - cand_years[None, :]           # Q x N
            w = np.exp(-lam * np.clip(age, 0, None)).astype("float32")
            Sw = S * w
            # undated candidate or future candidate = not temporally judgeable
            invalid = (~has_year[None, :]) | (age < 0)
            Sw = np.where(invalid, -1e9, Sw)
            # apply weighting only to queries that have a year; keep baseline
            # scores for undated queries
            S = np.where((q_year >= 0)[:, None], Sw, S)
            S[rows, self_col] = -1e9
        part = np.argpartition(-S, maxk, axis=1)[:, :maxk]         # top-maxk (unordered)
        part_scores = np.take_along_axis(S, part, axis=1)
        order = np.argsort(-part_scores, axis=1)                   # sort those
        top = np.take_along_axis(part, order, axis=1)
        return {query_ids[i]: [case_ids[j] for j in top[i]]
                for i in range(len(query_ids))}

    base_ranked = ranked_for(0.0)
    results = {"baseline": evaluate(query_ids, base_ranked, labels,
                                    k_values, citations)}
    for lam in lambdas:
        results[f"recency_lambda={lam}"] = evaluate(
            query_ids, ranked_for(lam), labels, k_values, citations)
    if per_query_k is not None:
        results["_perq"] = per_query_metrics(query_ids, base_ranked, labels,
                                             citations, per_query_k)
    return results


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", required=True)
    ap.add_argument("--labels", default=None)
    ap.add_argument("--years-json", default=None,
                    help="external {case_id: year} map (for corpora whose dates "
                         "the Canadian text parser cannot read, e.g. UA)")
    ap.add_argument("--citations-json", default=None,
                    help="{case_id: [cited_case_id,...]} = Cite(d), for the "
                         "Yoshioka Extended-Precision/Coverage metrics. If omitted, "
                         "the gold labels are reused as citations (works for COLIEE "
                         "where each case's noticed list IS its citation list).")
    ap.add_argument("--models", nargs="+", default=["e5", "bge-m3"],
                    choices=list(MODELS))
    ap.add_argument("--max-chars", type=int, default=4000,
                    help="truncate each case text to this many chars before encoding")
    ap.add_argument("--k-values", nargs="+", type=int, default=[1, 3, 5, 10])
    ap.add_argument("--lambdas", nargs="+", type=float,
                    default=[0.02, 0.05, 0.1, 0.2],
                    help="recency-decay rates to sweep (score *= exp(-lambda*age))")
    ap.add_argument("--limit", type=int, default=0,
                    help="use only the first N query cases (0 = all) for a smoke test")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--num-gpus", type=int, default=1,
                    help="GPUs to fan the encode across (1 = single card, best for "
                         "this ~9.7K-doc corpus; multi-GPU overhead only pays off at "
                         "paragraph-level / full-corpus scale; 0 = all visible)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--per-query-json", default=None,
                    help="dump per-query baseline metrics (for bootstrap CIs / "
                         "significance tests) at --perq-k")
    ap.add_argument("--perq-k", type=int, default=5)
    args = ap.parse_args()

    devices = ["cpu"]
    if any(m != "bm25" for m in args.models):  # dense models need torch/GPU
        try:
            import sentence_transformers  # noqa: F401
            import torch
        except ImportError:
            sys.exit("Dense models need `pip install sentence-transformers torch`.")
        n_gpu = torch.cuda.device_count()
        n_use = args.num_gpus if args.num_gpus > 0 else n_gpu
        devices = [f"cuda:{i}" for i in range(n_use)] if n_gpu else ["cpu"]

    case_ids, texts, years, labels = load_cases(
        args.zip, args.labels, args.max_chars, args.years_json)
    query_ids = [q for q in labels if q in texts]
    if args.limit:
        query_ids = query_ids[:args.limit]
    if args.citations_json:
        with open(args.citations_json) as fh:
            citations = {k: set(v) for k, v in json.load(fh).items()}
    else:
        citations = {k: set(v) for k, v in labels.items()}  # COLIEE: noticed = citations
    print(f"pool={len(case_ids)} cases | queries={len(query_ids)} "
          f"| dated={len(years)} | citing-docs={len(citations)} "
          f"| max_chars={args.max_chars} | devices={devices}", flush=True)

    per_query_k = args.perq_k if args.per_query_json else None
    all_results, perq = {}, {}
    for m in args.models:
        res = run_model(
            m, case_ids, texts, years, labels, query_ids,
            args.k_values, args.lambdas, args.batch_size, devices, citations,
            per_query_k)
        if "_perq" in res:
            perq[m] = res.pop("_perq")
        all_results[m] = res

    if args.per_query_json:
        with open(args.per_query_json, "w") as fh:
            json.dump({"k": args.perq_k, "per_query": perq}, fh)
        print(f"wrote {args.per_query_json}")

    print("\n===== Retrieval results (macro P/R/F1) =====")
    for m, res in all_results.items():
        print(f"\n[{m}]")
        for variant, byk in res.items():
            print(f"  {variant}")
            for k, v in byk.items():
                extra = (f"  ExtP={v['ExtP']:.4f}  Cov={v['Cov']:.4f}"
                         if "ExtP" in v else "")
                print(f"    {k:6s}  P={v['P']:.4f}  R={v['R']:.4f}  "
                      f"F1={v['F1']:.4f}{extra}")

    if args.out:
        with open(args.out, "w") as fh:
            json.dump({"config": vars(args), "results": all_results}, fh, indent=2)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
