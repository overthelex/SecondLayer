#!/usr/bin/env python3
"""Dump top-k ranked lists for the dense encoders, so that rank-aware measures
(Reachability Gain) can be scored on more than the BM25 baseline.

The July runs reported aggregate metrics only and did not keep the rankings,
so RG could not be recomputed from them. This script writes them out.
Settings match the paper exactly: max_chars 4000, E5 at 512 tokens with the
query:/passage: prefixes, BGE-M3 at 1024 tokens.

CPU-only by default (no GPU on this host); ~1.5-4 h per model per corpus.

    python scripts/coliee/dump_rankings.py --corpus ua --models e5 bge-m3
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retrieval_experiment import MODELS, load_cases  # noqa: E402

DATA = "data/coliee/task1"
CORPORA = {
    "ua": {"zip": f"{DATA}/ua_case_retrieval.zip",
           "years_json": f"{DATA}/ua_years.json"},
    "ca": {"zip": f"{DATA}/task1_train_files_2026.zip", "years_json": None},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", choices=list(CORPORA), required=True)
    ap.add_argument("--models", nargs="+", default=["e5", "bge-m3"])
    ap.add_argument("--depth", type=int, default=10)
    ap.add_argument("--max-chars", type=int, default=4000)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--threads", type=int, default=0,
                    help="torch CPU threads (0 = leave default)")
    args = ap.parse_args()

    import numpy as np
    import torch
    if args.threads:
        torch.set_num_threads(args.threads)
    from sentence_transformers import SentenceTransformer

    cfg = CORPORA[args.corpus]
    case_ids, texts, _, labels = load_cases(
        cfg["zip"], None, args.max_chars, cfg["years_json"])
    query_ids = [q for q in labels if q in texts]
    idx = {c: i for i, c in enumerate(case_ids)}
    print(f"[{args.corpus}] pool={len(case_ids)} queries={len(query_ids)}",
          flush=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    for key in args.models:
        mc = MODELS[key]
        out = f"{DATA}/rankings_{args.corpus}_{key.replace('-', '')}.json"
        if os.path.exists(out):
            print(f"  {key}: {out} exists, skipping", flush=True)
            continue
        t0 = time.time()
        model = SentenceTransformer(mc["hf"], device=device)
        model.max_seq_length = mc["max_seq_length"]
        pool_emb = model.encode([mc["passage_prefix"] + texts[c] for c in case_ids],
                                batch_size=args.batch_size,
                                normalize_embeddings=True, show_progress_bar=False)
        print(f"  {key}: pool encoded in {(time.time()-t0)/60:.1f} min", flush=True)
        q_emb = model.encode([mc["query_prefix"] + texts[q] for q in query_ids],
                             batch_size=args.batch_size,
                             normalize_embeddings=True, show_progress_bar=False)
        sims = np.asarray(q_emb, dtype="float32") @ np.asarray(pool_emb, dtype="float32").T
        for i, q in enumerate(query_ids):
            sims[i, idx[q]] = -1e9
        part = np.argpartition(-sims, args.depth, axis=1)[:, :args.depth]
        order = np.argsort(-np.take_along_axis(sims, part, axis=1), axis=1)
        top = np.take_along_axis(part, order, axis=1)
        ranked = {query_ids[i]: [case_ids[j] for j in top[i]]
                  for i in range(len(query_ids))}
        with open(out, "w") as fh:
            json.dump({"corpus": args.corpus, "model": key,
                       "max_chars": args.max_chars,
                       "max_seq_length": mc["max_seq_length"],
                       "depth": args.depth, "rankings": ranked}, fh)
        print(f"  {key}: wrote {out} in {(time.time()-t0)/60:.1f} min total",
              flush=True)
        del model, pool_emb, q_emb, sims


if __name__ == "__main__":
    main()
