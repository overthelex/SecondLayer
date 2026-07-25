#!/usr/bin/env python3
"""
Semantic Tier 2: detect circulus in definiendo via E5-large cosine similarity.

For definitions that Tier 1 (morphological) did NOT flag, compute:
  cos(embed(definiendum + genus), embed(differentia)) > threshold

This catches semantic paraphrases where the definiens restates the definiendum
without sharing surface morphemes.

Usage:
  python3 detect_circulus_semantic.py
  python3 detect_circulus_semantic.py --threshold 0.82 --batch-size 64
"""

import json
import sys
import time
import numpy as np
from pathlib import Path

THRESHOLD = 0.82
BATCH_SIZE = 64
MODEL_NAME = "intfloat/multilingual-e5-large"


def load_data():
    defs = [json.loads(l) for l in open("definitions.jsonl")]
    circ = {}
    for l in open("circulus_results.jsonl"):
        r = json.loads(l)
        circ[(r["rada_id"], r["definiendum"])] = r["is_circulus"]

    tier1_negative = [d for d in defs if not circ.get((d["rada_id"], d["definiendum"]), False)]
    tier1_positive = [d for d in defs if circ.get((d["rada_id"], d["definiendum"]), False)]

    print(f"Total definitions: {len(defs)}")
    print(f"Tier 1 positive (morphological): {len(tier1_positive)}")
    print(f"Tier 1 negative (candidates for Tier 2): {len(tier1_negative)}")
    return tier1_negative, tier1_positive


def encode_batch(model, texts, batch_size=64):
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        emb = model.encode(batch, normalize_embeddings=True, show_progress_bar=False)
        all_embeddings.append(emb)
        if (i // batch_size) % 10 == 0 and i > 0:
            print(f"  encoded {i}/{len(texts)}", flush=True)
    return np.vstack(all_embeddings)


def main():
    threshold = THRESHOLD
    batch_size = BATCH_SIZE

    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--threshold":
            threshold = float(sys.argv[i + 2])
        if arg == "--batch-size":
            batch_size = int(sys.argv[i + 2])

    print(f"Config: model={MODEL_NAME}, threshold={threshold}, batch_size={batch_size}")

    tier1_neg, tier1_pos = load_data()

    print(f"\nLoading model {MODEL_NAME}...")
    t0 = time.time()
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_NAME)
    print(f"Model loaded in {time.time()-t0:.1f}s")

    # Prepare texts: E5 requires "query: " or "passage: " prefix
    left_texts = []
    right_texts = []
    for d in tier1_neg:
        definiendum = d["definiendum"]
        genus = d.get("genus_proximum", "")
        differentia = d.get("differentia_specifica", "") or d.get("full_definiens", "")
        left_texts.append(f"query: {definiendum} {genus}".strip())
        right_texts.append(f"passage: {differentia[:500]}")

    print(f"\nEncoding {len(left_texts)} definiendum+genus texts...")
    t0 = time.time()
    left_emb = encode_batch(model, left_texts, batch_size)
    print(f"  Done in {time.time()-t0:.1f}s")

    print(f"Encoding {len(right_texts)} differentia texts...")
    t0 = time.time()
    right_emb = encode_batch(model, right_texts, batch_size)
    print(f"  Done in {time.time()-t0:.1f}s")

    # Cosine similarity (already normalized)
    similarities = np.sum(left_emb * right_emb, axis=1)

    print(f"\nSimilarity stats:")
    print(f"  Mean: {similarities.mean():.4f}")
    print(f"  Std:  {similarities.std():.4f}")
    print(f"  Min:  {similarities.min():.4f}")
    print(f"  Max:  {similarities.max():.4f}")
    print(f"  Median: {np.median(similarities):.4f}")

    # Distribution
    for t in [0.70, 0.75, 0.80, 0.82, 0.85, 0.88, 0.90, 0.92, 0.95]:
        n = (similarities >= t).sum()
        print(f"  >= {t:.2f}: {n:5d} ({n/len(similarities)*100:.1f}%)")

    # Apply threshold
    tier2_positive = similarities >= threshold
    n_new = tier2_positive.sum()
    print(f"\nTier 2 detections (threshold={threshold}): {n_new}/{len(tier1_neg)} ({n_new/len(tier1_neg)*100:.1f}%)")
    print(f"Combined: Tier 1 ({len(tier1_pos)}) + Tier 2 ({n_new}) = {len(tier1_pos) + n_new} total circulus")
    print(f"New rate: {(len(tier1_pos) + n_new) / (len(tier1_pos) + len(tier1_neg)) * 100:.1f}%")

    # Save results
    results = []
    for i, d in enumerate(tier1_neg):
        results.append({
            "rada_id": d["rada_id"],
            "definiendum": d["definiendum"],
            "similarity": round(float(similarities[i]), 4),
            "is_semantic_circulus": bool(tier2_positive[i]),
        })

    output_path = "semantic_circulus_results.jsonl"
    with open(output_path, "w") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\nSaved to {output_path}")

    # Show top-20 most similar (likely semantic circulus)
    top_idx = np.argsort(similarities)[::-1][:20]
    print(f"\nTop 20 most similar (potential semantic circulus):")
    for idx in top_idx:
        d = tier1_neg[idx]
        sim = similarities[idx]
        print(f"  {sim:.3f}  {d['definiendum'][:40]:40s}  {d['rada_id']}")


if __name__ == "__main__":
    main()
