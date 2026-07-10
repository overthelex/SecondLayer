#!/usr/bin/env python3
"""
Build a cross-encoder reranker training set from the EVAL-500K citation-graph
benchmark (CORE-58 / CORE-63).

The benchmark gives graded qrels (grade 1/2/3) over a 100K-doc pool where every
doc has a bge-m3 embedding and a citation-stripped text. A reranker must learn to
re-order the bi-encoder's top results so that citation-relevant decisions rise.
We therefore build, per query:

  positives   all graded docs in qrels[q]  (grade 1/2/3)
  hard negs   top bge-m3 cosine neighbours that are grade-0 (the exact mistakes
              the production bi-encoder makes - the reranker's job is to sink them)
  rand negs   random grade-0 pool docs (easy negatives, keep the model calibrated)

Queries (not pairs) are split into train/dev/test, stratified by
(year-bucket x justice_kind) so a query's positives never leak across splits.
Texts go to a separate corpus.jsonl; pair files reference doc_ids only, so a
query's ~76 positives don't duplicate 5KB of text per row.

Inputs  (output/eval500k/):
  qrels.txt            qid 0 doc_id grade   (grade in 1..3)
  excluded.txt         qid doc_id           (same-case, masked everywhere)
  queries.csv          doc_id, adj_year, justice_kind, ...
  embeddings/<slug>/*.parquet   doc_id, vector  (L2-normalizable, doc-level)
  texts_pool/*.jsonl   {doc_id, adj_year, justice_kind, text}  (stripped)

Outputs (output/eval500k/reranker/):
  corpus.jsonl                 {doc_id, text}      (every referenced doc, deduped)
  train.jsonl / dev.jsonl / test.jsonl
                               {qid, doc_id, grade, label, source}
                               label = 1 if grade>=1 else 0; source in pos|hard|rand
  dataset_stats.json

Usage:
  python3 18_build_reranker_dataset.py                         # full build
  python3 18_build_reranker_dataset.py --num-queries 50        # smoke
  python3 18_build_reranker_dataset.py --num-hard 50 --num-rand 30
"""

import argparse
import csv
import json
import logging
import os
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("reranker-ds")

OUTPUT_DIR = Path(__file__).parent / "output" / "eval500k"
RERANK_DIR = OUTPUT_DIR / "reranker"
SEED = 42


def year_bucket(y):
    y = int(y)
    return "2010-14" if y < 2015 else "2015-19" if y < 2020 else "2020-21" if y < 2022 else "2022-25"


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
    log.info("qrels: %d queries, %d graded pairs", len(qrels),
             sum(len(v) for v in qrels.values()))
    return dict(qrels), excluded, meta


def load_matrix(slug):
    import pyarrow.parquet as pq
    shard_dir = OUTPUT_DIR / "embeddings" / slug
    ids, vecs = [], []
    for f in sorted(shard_dir.glob("*.parquet")):
        t = pq.read_table(f, columns=["doc_id", "vector"])
        ids += t["doc_id"].to_pylist()
        vecs.append(np.array(t["vector"].to_pylist(), dtype=np.float32))
    mat = np.vstack(vecs)
    mat /= np.maximum(np.linalg.norm(mat, axis=1, keepdims=True), 1e-9)
    ids = np.array(ids, dtype=np.int64)
    log.info("%s embeddings: %s", slug, mat.shape)
    return ids, mat


def split_queries(qids, meta, ratios, rng):
    """Stratified query split by (year-bucket, justice_kind)."""
    strata = defaultdict(list)
    for q in qids:
        m = meta[q]
        strata[(year_bucket(m["adj_year"]), m["justice_kind"])].append(q)
    train, dev, test = [], [], []
    for cell, pool in sorted(strata.items()):
        pool = sorted(pool)
        rng.shuffle(pool)
        n = len(pool)
        n_tr = int(round(n * ratios[0]))
        n_dv = int(round(n * ratios[1]))
        train += pool[:n_tr]
        dev += pool[n_tr:n_tr + n_dv]
        test += pool[n_tr + n_dv:]
    log.info("split: train=%d dev=%d test=%d", len(train), len(dev), len(test))
    return {"train": set(train), "dev": set(dev), "test": set(test)}


def mine_hard_negs(queries, qrels, excluded, ids, mat, num_hard):
    """Top bge-m3 cosine grade-0 neighbours per query (batched matmul)."""
    pos = {int(d): i for i, d in enumerate(ids)}
    present = [q for q in queries if q in pos]
    if len(present) < len(queries):
        log.warning("%d queries missing from embeddings (skipped for hard-neg)",
                    len(queries) - len(present))
    hard = {}
    B = 256
    kmax = num_hard + 1024  # headroom for masked self/excluded/positives
    for b in range(0, len(present), B):
        batch = present[b:b + B]
        sims = mat[[pos[q] for q in batch]] @ mat.T
        for j, q in enumerate(batch):
            row = sims[j]
            row[pos[q]] = -np.inf
            for d in excluded.get(q, ()):
                if d in pos:
                    row[pos[d]] = -np.inf
            for d in qrels[q]:
                if d in pos:
                    row[pos[d]] = -np.inf
            k = min(kmax, len(row))
            top = np.argpartition(-row, k - 1)[:k]
            top = top[np.argsort(-row[top])]
            negs = [int(ids[t]) for t in top if np.isfinite(row[t])][:num_hard]
            hard[q] = negs
        if (b // B) % 4 == 0:
            log.info("hard-neg: %d/%d queries", min(b + B, len(present)), len(present))
    return hard


def build_pairs(queries, qrels, excluded, hard, pool_ids, num_rand, rng):
    """Per-query positives + hard + random-neg records."""
    pool = list(pool_ids)
    pairs = []
    for q in queries:
        used = {q} | set(excluded.get(q, ())) | set(qrels[q]) | set(hard.get(q, ()))
        for d, g in qrels[q].items():
            pairs.append({"qid": q, "doc_id": d, "grade": g, "label": 1, "source": "pos"})
        for d in hard.get(q, ()):
            pairs.append({"qid": q, "doc_id": d, "grade": 0, "label": 0, "source": "hard"})
        qrng = random.Random(SEED ^ (q * 2654435761 & 0xFFFFFFFF))
        picked, tries = [], 0
        while len(picked) < num_rand and tries < num_rand * 20:
            d = pool[qrng.randrange(len(pool))]
            tries += 1
            if d not in used:
                used.add(d); picked.append(d)
        for d in picked:
            pairs.append({"qid": q, "doc_id": d, "grade": 0, "label": 0, "source": "rand"})
    return pairs


def write_corpus(doc_ids, out_path):
    """Scan texts_pool (then texts_stripped for any miss) for referenced docs."""
    need = set(doc_ids)
    found = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as out:
        for sub in ("texts_pool", "texts_stripped"):
            d = OUTPUT_DIR / sub
            if not d.exists():
                continue
            for shard in sorted(d.glob("*.jsonl")):
                with open(shard) as f:
                    for line in f:
                        try:
                            rec = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        did = rec.get("doc_id")
                        if did in need:
                            out.write(json.dumps({"doc_id": did, "text": rec.get("text", "")},
                                                 ensure_ascii=False) + "\n")
                            need.discard(did); found += 1
                if not need:
                    break
            if not need:
                break
    log.info("corpus: %d/%d docs written%s", found, len(doc_ids),
             "" if not need else f"  ({len(need)} missing texts!)")
    return need


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--embed-model", default="bge-m3", help="embedding slug for hard-neg mining")
    ap.add_argument("--num-queries", type=int, default=0, help="0 = all (smoke: e.g. 50)")
    ap.add_argument("--num-hard", type=int, default=30)
    ap.add_argument("--num-rand", type=int, default=20)
    ap.add_argument("--ratios", default="0.8,0.1,0.1", help="train,dev,test")
    args = ap.parse_args()
    ratios = tuple(float(x) for x in args.ratios.split(","))
    assert abs(sum(ratios) - 1.0) < 1e-6, "ratios must sum to 1"

    rng = random.Random(SEED)
    qrels, excluded, meta = load_qrels()
    qids = sorted(qrels)
    if args.num_queries:
        qids = sorted(rng.sample(qids, min(args.num_queries, len(qids))))
        qrels = {q: qrels[q] for q in qids}
        log.info("smoke: %d queries", len(qids))

    ids, mat = load_matrix(args.embed_model)
    pool_ids = set(int(x) for x in ids)

    splits = split_queries(qids, meta, ratios, rng)
    hard = mine_hard_negs(qids, qrels, excluded, ids, mat, args.num_hard)

    RERANK_DIR.mkdir(parents=True, exist_ok=True)
    all_docs = set(qids)
    stats = {"embed_model": args.embed_model, "num_hard": args.num_hard,
             "num_rand": args.num_rand, "ratios": list(ratios), "seed": SEED,
             "splits": {}}
    for name, qset in splits.items():
        qlist = sorted(qset & set(qids))
        pairs = build_pairs(qlist, qrels, excluded, hard, pool_ids, args.num_rand, rng)
        with open(RERANK_DIR / f"{name}.jsonl", "w") as f:
            for p in pairs:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")
                all_docs.add(p["doc_id"])
        src = Counter(p["source"] for p in pairs)
        stats["splits"][name] = {
            "queries": len(qlist), "pairs": len(pairs),
            "pos": src["pos"], "hard": src["hard"], "rand": src["rand"],
            "avg_pos_per_q": round(src["pos"] / max(1, len(qlist)), 1),
        }
        log.info("%s: %d queries, %d pairs (pos=%d hard=%d rand=%d)",
                 name, len(qlist), len(pairs), src["pos"], src["hard"], src["rand"])

    missing = write_corpus(all_docs, RERANK_DIR / "corpus.jsonl")
    stats["corpus_docs"] = len(all_docs) - len(missing)
    stats["corpus_missing"] = len(missing)
    json.dump(stats, open(RERANK_DIR / "dataset_stats.json", "w"), indent=2, ensure_ascii=False)
    log.info("DONE -> %s\n%s", RERANK_DIR, json.dumps(stats["splits"], indent=2))


if __name__ == "__main__":
    main()
