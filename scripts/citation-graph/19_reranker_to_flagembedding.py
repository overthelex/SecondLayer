#!/usr/bin/env python3
"""
Convert the CORE-63 reranker triples into FlagEmbedding reranker-finetune format
(CORE-64).

Input  (reranker/ from 18_build_reranker_dataset.py):
  corpus.jsonl                 {doc_id, text}
  train.jsonl / dev.jsonl      {qid, doc_id, grade, label, source}

Output (--out-dir):
  ft_train.jsonl / ft_dev.jsonl   {query, pos: [text...], neg: [text...]}

FlagEmbedding builds train groups of `train_group_size` passages (1 sampled pos
+ rest negs) per line, so each line needs >= 1 pos and enough negs. We cap pos
per query (--max-pos) for balanced, bounded line sizes and keep all negatives
(hard bge-m3 mistakes + random). Queries lacking a pos or a neg are dropped.

Usage:
  python3 19_reranker_to_flagembedding.py \
      --in-dir output/eval500k/reranker --out-dir /data/reranker-train
"""

import argparse
import json
import logging
import random
from collections import defaultdict
from pathlib import Path

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("ft-convert")
SEED = 42


def load_corpus(path):
    corpus = {}
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            corpus[r["doc_id"]] = r["text"]
    log.info("corpus: %d docs", len(corpus))
    return corpus


def convert(split_path, corpus, out_path, max_pos, max_neg, rng):
    groups = defaultdict(lambda: {"pos": [], "neg": []})
    with open(split_path) as f:
        for line in f:
            r = json.loads(line)
            groups[r["qid"]]["pos" if r["label"] == 1 else "neg"].append(r["doc_id"])
    kept, drop_nopos, drop_noneg, miss = 0, 0, 0, 0
    with open(out_path, "w") as out:
        for qid, g in groups.items():
            if qid not in corpus:
                miss += 1
                continue
            pos_ids, neg_ids = g["pos"], g["neg"]
            if not pos_ids:
                drop_nopos += 1
                continue
            if not neg_ids:
                drop_noneg += 1
                continue
            rng.shuffle(pos_ids)
            pos = [corpus[d] for d in pos_ids[:max_pos] if d in corpus]
            neg = [corpus[d] for d in neg_ids[:max_neg] if d in corpus]
            if not pos or not neg:
                continue
            out.write(json.dumps({"query": corpus[qid], "pos": pos, "neg": neg},
                                 ensure_ascii=False) + "\n")
            kept += 1
    log.info("%s -> %s: kept=%d (drop no-pos=%d no-neg=%d miss-query=%d)",
             split_path.name, out_path.name, kept, drop_nopos, drop_noneg, miss)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in-dir", default="output/eval500k/reranker")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--max-pos", type=int, default=15)
    ap.add_argument("--max-neg", type=int, default=50)
    args = ap.parse_args()

    in_dir, out_dir = Path(args.in_dir), Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    corpus = load_corpus(in_dir / "corpus.jsonl")
    for split, out in (("train", "ft_train.jsonl"), ("dev", "ft_dev.jsonl")):
        convert(in_dir / f"{split}.jsonl", corpus, out_dir / out,
                args.max_pos, args.max_neg, rng)
    log.info("DONE -> %s", out_dir)


if __name__ == "__main__":
    main()
