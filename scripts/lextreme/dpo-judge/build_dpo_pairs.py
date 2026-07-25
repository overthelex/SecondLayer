#!/usr/bin/env python3
"""
Build DPO training pairs from judge annotations.

Reads judge_annotations.jsonl and response_pairs.jsonl, pairs them,
and outputs DPO-format JSONL (prompt, chosen, rejected) filtered by
judge confidence.
"""

import json
import argparse
from pathlib import Path
from collections import Counter

DATA_DIR = Path(__file__).parent
PAIRS_PATH = DATA_DIR / "response_pairs.jsonl"
ANNOTATIONS_PATH = DATA_DIR / "judge_annotations.jsonl"
OUTPUT_PATH = DATA_DIR / "dpo_train.jsonl"
STATS_PATH = DATA_DIR / "dpo_stats.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-confidence", choices=["high", "medium", "low"], default="medium",
                        help="Minimum judge confidence to include")
    args = parser.parse_args()

    confidence_order = {"high": 3, "medium": 2, "low": 1}
    min_conf = confidence_order[args.min_confidence]

    pairs_by_id = {}
    with open(PAIRS_PATH) as f:
        for line in f:
            d = json.loads(line)
            pairs_by_id[d["metadata"]["doc_id"]] = d

    annotations = []
    with open(ANNOTATIONS_PATH) as f:
        for line in f:
            annotations.append(json.loads(line))

    stats = Counter()
    dpo_pairs = []

    for ann in annotations:
        doc_id = ann["doc_id"]
        pair = pairs_by_id.get(doc_id)
        if pair is None:
            stats["missing_pair"] += 1
            continue

        agg = ann["aggregation"]
        conf = confidence_order.get(agg["confidence"], 0)

        if conf < min_conf:
            stats["low_confidence"] += 1
            continue

        if agg["majority_preferred"] == "tie":
            stats["tie"] += 1
            continue

        if agg["majority_preferred"] == "A":
            chosen = pair["response_a"]
            rejected = pair["response_b"]
        else:
            chosen = pair["response_b"]
            rejected = pair["response_a"]

        dpo_pairs.append({
            "prompt": pair["prompt"],
            "chosen": chosen,
            "rejected": rejected,
            "metadata": {
                "doc_id": doc_id,
                "epoch": ann["epoch"],
                "label": ann["label"],
                "adjudication_date": ann.get("adjudication_date", ""),
                "confidence": agg["confidence"],
                "agreement": agg["agreement"],
                "score_a": ann["score_a_weighted"],
                "score_b": ann["score_b_weighted"],
                "preferred": agg["majority_preferred"],
            },
        })
        stats["included"] += 1
        stats[f"epoch_{ann['epoch']}"] += 1
        stats[f"preferred_{agg['majority_preferred']}"] += 1

    with open(OUTPUT_PATH, "w") as f:
        for p in dpo_pairs:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")

    summary = {
        "total_annotations": len(annotations),
        "total_dpo_pairs": len(dpo_pairs),
        "min_confidence": args.min_confidence,
        "breakdown": dict(stats),
        "epoch_distribution": {
            e: stats.get(f"epoch_{e}", 0)
            for e in ["pre_war", "hybrid_war", "full_scale"]
        },
        "preference_distribution": {
            "A": stats.get("preferred_A", 0),
            "B": stats.get("preferred_B", 0),
        },
    }

    with open(STATS_PATH, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nOutput: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
