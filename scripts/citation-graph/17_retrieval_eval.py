#!/usr/bin/env python3
"""
Retrieval evaluation against citation-graph qrels (PAPER-48).

For each model slug: download doc-level parquet embeddings from S3 (cached
locally), brute-force cosine search over the 100K pool (vectors are
L2-normalized -> matrix product), score against output/eval500k/qrels.txt.

Protocol:
  - query vector = the query decision's own doc vector (case-to-case retrieval)
  - self and same-case docs (excluded.txt) are masked out of rankings
  - nDCG uses graded gains 2^g - 1 (g in {1,2,3}); ideal DCG from the full
    graded list. Recall@k and MRR@10 treat grade>=1 as relevant.
  - qrels were truncated at 1000 candidates/query - recall denominators use
    the stored qrels, which is consistent across models.

Outputs:
  output/eval500k/results/<slug>.json          summary + per-year/kind slices
  output/eval500k/results/<slug>_perquery.csv  per-query nDCG@10/100
  output/eval500k/results/summary.json         all models + paired bootstrap
  MLflow: experiment citation-embedding-eval, run eval-<slug>

Usage:
  python3 17_retrieval_eval.py                       # all available slugs
  python3 17_retrieval_eval.py --models bge-m3 bge-m3-ua
"""

import argparse
import csv
import json
import logging
import os
from collections import defaultdict
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("eval")

OUTPUT_DIR = Path(__file__).parent / "output" / "eval500k"
RESULTS_DIR = OUTPUT_DIR / "results"
CACHE_DIR = OUTPUT_DIR / "embeddings"
BUCKET = "secondlayer-ml-data-usw2"
REGION = "us-west-2"
DEFAULT_SLUGS = ["bge-m3", "bge-m3-ua", "me5", "bge-m3-raw", "me5-raw"]
K_NDCG = (10, 100)
RECALL_K = 100
MRR_K = 10
BOOTSTRAP = 10_000
SEED = 42


def download_embeddings(slug):
    import boto3
    dest = CACHE_DIR / slug
    s3 = boto3.client("s3", region_name=REGION)
    prefix = f"citation-eval/embeddings/{slug}/"
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].endswith(".parquet")]
    if not keys:
        return None
    dest.mkdir(parents=True, exist_ok=True)
    todo = [k for k in keys if not (dest / Path(k).name).exists()]
    log.info("%s: %d shards (%d to download)", slug, len(keys), len(todo))
    for k in todo:
        s3.download_file(BUCKET, k, str(dest / Path(k).name))
    return dest


def load_matrix(shard_dir):
    import pyarrow.parquet as pq
    ids, vecs = [], []
    for f in sorted(shard_dir.glob("*.parquet")):
        t = pq.read_table(f)
        ids += t["doc_id"].to_pylist()
        vecs.append(np.array(t["vector"].to_pylist(), dtype=np.float32))
    mat = np.vstack(vecs)
    mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-9)
    return np.array(ids, dtype=np.int64), mat


def load_qrels():
    qrels = defaultdict(dict)
    with open(OUTPUT_DIR / "qrels.txt") as f:
        for line in f:
            q, _, d, g = line.split()
            qrels[int(q)][int(d)] = int(g)
    excluded = defaultdict(set)
    with open(OUTPUT_DIR / "excluded.txt") as f:
        for line in f:
            q, d = line.split()
            excluded[int(q)].add(int(d))
    meta = {}
    with open(OUTPUT_DIR / "queries.csv") as f:
        for r in csv.DictReader(f):
            meta[int(r["doc_id"])] = r
    return qrels, excluded, meta


def dcg(gains):
    return float(np.sum((2.0 ** np.asarray(gains, dtype=np.float64) - 1)
                        / np.log2(np.arange(2, len(gains) + 2))))


def evaluate(slug, ids, mat, qrels, excluded, meta):
    pos = {d: i for i, d in enumerate(ids)}
    queries = [q for q in qrels if q in pos]
    missing = len(qrels) - len(queries)
    if missing:
        log.warning("%s: %d queries missing from embeddings", slug, missing)

    per_query = {}
    kmax = max(*K_NDCG, RECALL_K, MRR_K)
    B = 256
    for b in range(0, len(queries), B):
        batch = queries[b:b + B]
        qmat = mat[[pos[q] for q in batch]]
        sims = qmat @ mat.T                       # (B, N)
        for j, q in enumerate(batch):
            row = sims[j]
            row[pos[q]] = -np.inf
            for d in excluded.get(q, ()):
                if d in pos:
                    row[pos[d]] = -np.inf
            top = np.argpartition(-row, kmax)[:kmax]
            top = top[np.argsort(-row[top])]
            ranked = ids[top]
            rel = qrels[q]
            gains = [rel.get(int(d), 0) for d in ranked]
            ideal = sorted(rel.values(), reverse=True)
            m = {}
            for k in K_NDCG:
                idcg = dcg(ideal[:k])
                m[f"ndcg@{k}"] = dcg(gains[:k]) / idcg if idcg > 0 else 0.0
            n_rel = len(rel)
            hits = sum(1 for g in gains[:RECALL_K] if g > 0)
            m[f"recall@{RECALL_K}"] = hits / min(n_rel, RECALL_K)
            rr = 0.0
            for rank, g in enumerate(gains[:MRR_K], 1):
                if g > 0:
                    rr = 1.0 / rank
                    break
            m[f"mrr@{MRR_K}"] = rr
            per_query[q] = m
        if (b // B) % 4 == 0:
            log.info("%s: %d/%d queries", slug, min(b + B, len(queries)), len(queries))

    summary = {k: float(np.mean([v[k] for v in per_query.values()]))
               for k in next(iter(per_query.values()))}

    slices = defaultdict(lambda: defaultdict(list))
    for q, m in per_query.items():
        y = int(meta[q]["adj_year"])
        bucket = ("2010-14" if y < 2015 else "2015-19" if y < 2020
                  else "2020-21" if y < 2022 else "2022-25")
        slices["year"][bucket].append(m["ndcg@10"])
        slices["kind"][meta[q]["justice_kind"]].append(m["ndcg@10"])
    slice_out = {dim: {k: round(float(np.mean(v)), 4) for k, v in sorted(d.items())}
                 for dim, d in slices.items()}
    return per_query, summary, slice_out


def paired_bootstrap(a, b, rng):
    """P(mean(a) <= mean(b)) under paired bootstrap; a,b aligned arrays."""
    diffs = a - b
    n = len(diffs)
    idx = rng.integers(0, n, size=(BOOTSTRAP, n))
    means = diffs[idx].mean(axis=1)
    return float((means <= 0).mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models", nargs="*", default=DEFAULT_SLUGS)
    ap.add_argument("--no-mlflow", action="store_true")
    args = ap.parse_args()

    qrels, excluded, meta = load_qrels()
    log.info("qrels: %d queries", len(qrels))
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    mlflow = None
    if not args.no_mlflow:
        try:
            import mlflow as _mlf
            mlflow = _mlf
            # local default: MLflow over WG mesh (public domain retired 2026-06-12)
            mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://mlflow.lex:5000"))
            mlflow.set_experiment("citation-embedding-eval")
        except Exception as e:
            mlflow = None
            log.warning("mlflow disabled: %s", e)

    all_pq, all_summaries = {}, {}
    for slug in args.models:
        shard_dir = download_embeddings(slug)
        if shard_dir is None:
            log.warning("%s: no embeddings in S3, skipping", slug)
            continue
        ids, mat = load_matrix(shard_dir)
        log.info("%s: matrix %s", slug, mat.shape)
        per_query, summary, slice_out = evaluate(slug, ids, mat, qrels, excluded, meta)
        all_pq[slug], all_summaries[slug] = per_query, summary
        log.info("%s: %s", slug, {k: round(v, 4) for k, v in summary.items()})

        json.dump({"slug": slug, "summary": summary, "slices": slice_out,
                   "n_queries": len(per_query)},
                  open(RESULTS_DIR / f"{slug}.json", "w"), indent=2)
        with open(RESULTS_DIR / f"{slug}_perquery.csv", "w", newline="") as f:
            w = csv.writer(f)
            keys = sorted(next(iter(per_query.values())))
            w.writerow(["query"] + keys)
            for q, m in sorted(per_query.items()):
                w.writerow([q] + [round(m[k], 5) for k in keys])

        if mlflow:
            with mlflow.start_run(run_name=f"eval-{slug}"):
                mlflow.log_params({"model_slug": slug, "n_queries": len(per_query),
                                   "protocol": "doc-vector cosine, pooled 100K"})
                mlflow.log_metrics({k.replace("@", "_at_"): v for k, v in summary.items()})
                for dim, d in slice_out.items():
                    mlflow.log_metrics({f"ndcg10_{dim}_{k.replace('-', '_')}": v
                                        for k, v in d.items()})

    # paired significance on nDCG@10
    rng = np.random.default_rng(SEED)
    pairs = [("bge-m3-ua", "bge-m3"), ("bge-m3", "me5"),
             ("bge-m3-raw", "bge-m3"), ("me5-raw", "me5")]
    sig = {}
    for a, b in pairs:
        if a in all_pq and b in all_pq:
            common = sorted(set(all_pq[a]) & set(all_pq[b]))
            va = np.array([all_pq[a][q]["ndcg@10"] for q in common])
            vb = np.array([all_pq[b][q]["ndcg@10"] for q in common])
            sig[f"{a} vs {b}"] = {
                "ndcg@10_a": round(float(va.mean()), 4),
                "ndcg@10_b": round(float(vb.mean()), 4),
                "delta": round(float((va - vb).mean()), 4),
                "p_a_not_better": round(paired_bootstrap(va, vb, rng), 4),
            }

    json.dump({"summaries": all_summaries, "significance": sig},
              open(RESULTS_DIR / "summary.json", "w"), indent=2)
    print(json.dumps({"summaries": {s: {k: round(v, 4) for k, v in m.items()}
                                    for s, m in all_summaries.items()},
                      "significance": sig}, indent=2))


if __name__ == "__main__":
    main()
