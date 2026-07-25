#!/usr/bin/env python3
"""SageMaker entry point: dump dense top-k ranked lists for the COLIEE and the
matched Ukrainian case-retrieval corpora.

Reads the corpus zips from the `corpus` channel, encodes pool and queries with
each requested model, and writes one rankings JSON per (corpus, model) into
/opt/ml/model, which SageMaker packs to the job's S3 output.

Settings mirror the paper: texts truncated to 4000 chars, E5 at 512 tokens with
the query:/passage: prefixes, BGE-M3 at 1024.
"""

import argparse
import json
import os
import time
import zipfile

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

CORPUS_DIR = os.environ.get("SM_CHANNEL_CORPUS", "/opt/ml/input/data/corpus")
OUT_DIR = os.environ.get("SM_MODEL_DIR", "/opt/ml/model")

CORPORA = {
    "ua": "ua_case_retrieval.zip",
    "ca": "task1_train_files_2026.zip",
}
MODELS = {
    "e5": {"hf": "intfloat/multilingual-e5-large", "q": "query: ",
           "p": "passage: ", "max_len": 512},
    "bge-m3": {"hf": "BAAI/bge-m3", "q": "", "p": "", "max_len": 1024},
}


def load_corpus(zip_path, max_chars):
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        label_name = sorted(
            [n for n in names if n.endswith(".json") and "label" in n.lower()],
            key=len)[0]
        labels = json.load(zf.open(label_name))
        texts = {}
        for n in names:
            if "/cases/" in n and n.endswith(".txt"):
                cid = n.rsplit("/", 1)[-1]
                texts[cid] = zf.open(n).read().decode("utf-8", "replace")[:max_chars]
    case_ids = sorted(texts)
    query_ids = [q for q in labels if q in texts]
    return case_ids, texts, query_ids


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="e5,bge-m3")
    ap.add_argument("--corpora", default="ua,ca")
    ap.add_argument("--depth", type=int, default=10)
    ap.add_argument("--max-chars", type=int, default=4000)
    ap.add_argument("--batch-size", type=int, default=64)
    args, _ = ap.parse_known_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={dev} "
          f"gpu={torch.cuda.get_device_name(0) if dev == 'cuda' else 'n/a'}",
          flush=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    loaded = {}
    for corpus in args.corpora.split(","):
        path = os.path.join(CORPUS_DIR, CORPORA[corpus])
        loaded[corpus] = load_corpus(path, args.max_chars)
        ids, _, qs = loaded[corpus]
        print(f"[{corpus}] pool={len(ids)} queries={len(qs)}", flush=True)

    for key in args.models.split(","):
        cfg = MODELS[key]
        t0 = time.time()
        model = SentenceTransformer(cfg["hf"], device=dev)
        model.max_seq_length = cfg["max_len"]
        for corpus in args.corpora.split(","):
            case_ids, texts, query_ids = loaded[corpus]
            idx = {c: i for i, c in enumerate(case_ids)}
            pool = model.encode([cfg["p"] + texts[c] for c in case_ids],
                                batch_size=args.batch_size,
                                normalize_embeddings=True, show_progress_bar=False)
            qemb = model.encode([cfg["q"] + texts[q] for q in query_ids],
                                batch_size=args.batch_size,
                                normalize_embeddings=True, show_progress_bar=False)
            sims = np.asarray(qemb, "float32") @ np.asarray(pool, "float32").T
            for i, q in enumerate(query_ids):
                sims[i, idx[q]] = -1e9
            part = np.argpartition(-sims, args.depth, axis=1)[:, :args.depth]
            order = np.argsort(-np.take_along_axis(sims, part, axis=1), axis=1)
            top = np.take_along_axis(part, order, axis=1)
            out = os.path.join(
                OUT_DIR, f"rankings_{corpus}_{key.replace('-', '')}.json")
            with open(out, "w") as fh:
                json.dump({"corpus": corpus, "model": key,
                           "max_chars": args.max_chars,
                           "max_seq_length": cfg["max_len"],
                           "depth": args.depth,
                           "rankings": {query_ids[i]: [case_ids[j] for j in top[i]]
                                        for i in range(len(query_ids))}}, fh)
            print(f"  wrote {out} ({(time.time()-t0)/60:.1f} min into {key})",
                  flush=True)
        del model
        if dev == "cuda":
            torch.cuda.empty_cache()
    print("done", flush=True)


if __name__ == "__main__":
    main()
