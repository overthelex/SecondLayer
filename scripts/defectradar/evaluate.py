#!/usr/bin/env python3
"""
Evaluate pipeline vs LLM annotations.

Compares DefectRadar pipeline predictions against LLM (lexwebapp chat)
annotations on the sampled 300 definitions.

Output: evaluation_report.json + console summary
"""

import json
import sys
from collections import Counter


def load_pipeline_results():
    """Load pipeline circulus and ignotum results, indexed by (rada_id, definiendum)."""
    circ = {}
    for line in open("circulus_results.jsonl"):
        r = json.loads(line)
        circ[(r["rada_id"], r["definiendum"])] = r["is_circulus"]

    igno = {}
    for line in open("ignotum_results.jsonl"):
        r = json.loads(line)
        igno[(r["rada_id"], r["definiendum"])] = bool(r["undefined_terms"])

    return circ, igno


def compute_metrics(y_true: list[bool], y_pred: list[bool]) -> dict:
    """Compute precision, recall, F1."""
    tp = sum(1 for t, p in zip(y_true, y_pred) if t and p)
    fp = sum(1 for t, p in zip(y_true, y_pred) if not t and p)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t and not p)
    tn = sum(1 for t, p in zip(y_true, y_pred) if not t and not p)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": round(precision * 100, 1),
        "recall": round(recall * 100, 1),
        "f1": round(f1 * 100, 1),
        "total": len(y_true),
        "positive_rate": round(sum(y_true) / len(y_true) * 100, 1),
    }


def main():
    annotations_path = "annotations.jsonl"
    if not annotations_path:
        annotations_path = "annotations_checkpoint.jsonl"

    # Load annotations
    annotations = []
    for line in open(annotations_path):
        annotations.append(json.loads(line))

    # Filter to those with valid parsed annotations
    valid = [a for a in annotations if a.get("annotation")]
    print(f"Loaded {len(annotations)} annotations, {len(valid)} with valid LLM parse")

    if len(valid) < 10:
        print("Too few valid annotations. Wait for more to complete.")
        sys.exit(0)

    # Load pipeline results
    pipe_circ, pipe_igno = load_pipeline_results()

    # Build comparison arrays
    # LLM as "ground truth" (pseudo-gold)
    llm_circulus = []
    pipe_circulus = []
    llm_ignotum = []
    pipe_ignotum = []

    for a in valid:
        key = (a["rada_id"], a["definiendum"])
        ann = a["annotation"]

        # Circulus
        llm_c = ann.get("circulus", "").upper() == "YES"
        pip_c = pipe_circ.get(key, False)
        llm_circulus.append(llm_c)
        pipe_circulus.append(pip_c)

        # Ignotum
        llm_i = ann.get("ignotum", "").upper() == "YES"
        pip_i = pipe_igno.get(key, False)
        llm_ignotum.append(llm_i)
        pipe_ignotum.append(pip_i)

    # Compute metrics: pipeline vs LLM-as-judge
    print("\n=== CIRCULUS IN DEFINIENDO ===")
    print(f"LLM says YES: {sum(llm_circulus)}/{len(llm_circulus)} ({sum(llm_circulus)/len(llm_circulus)*100:.1f}%)")
    print(f"Pipeline says YES: {sum(pipe_circulus)}/{len(pipe_circulus)} ({sum(pipe_circulus)/len(pipe_circulus)*100:.1f}%)")

    # Pipeline vs LLM (LLM as reference)
    m = compute_metrics(llm_circulus, pipe_circulus)
    print(f"\nPipeline vs LLM-judge:")
    print(f"  Precision: {m['precision']}%  (of pipeline YES, how many LLM agrees)")
    print(f"  Recall:    {m['recall']}%  (of LLM YES, how many pipeline catches)")
    print(f"  F1:        {m['f1']}%")
    print(f"  TP={m['tp']} FP={m['fp']} FN={m['fn']} TN={m['tn']}")

    # Agreement
    agree_c = sum(1 for l, p in zip(llm_circulus, pipe_circulus) if l == p)
    print(f"  Agreement: {agree_c}/{len(llm_circulus)} ({agree_c/len(llm_circulus)*100:.1f}%)")

    print("\n=== IGNOTUM PER IGNOTUM ===")
    print(f"LLM says YES: {sum(llm_ignotum)}/{len(llm_ignotum)} ({sum(llm_ignotum)/len(llm_ignotum)*100:.1f}%)")
    print(f"Pipeline says YES: {sum(pipe_ignotum)}/{len(pipe_ignotum)} ({sum(pipe_ignotum)/len(pipe_ignotum)*100:.1f}%)")

    m2 = compute_metrics(llm_ignotum, pipe_ignotum)
    print(f"\nPipeline vs LLM-judge:")
    print(f"  Precision: {m2['precision']}%")
    print(f"  Recall:    {m2['recall']}%")
    print(f"  F1:        {m2['f1']}%")
    print(f"  TP={m2['tp']} FP={m2['fp']} FN={m2['fn']} TN={m2['tn']}")

    agree_i = sum(1 for l, p in zip(llm_ignotum, pipe_ignotum) if l == p)
    print(f"  Agreement: {agree_i}/{len(llm_ignotum)} ({agree_i/len(llm_ignotum)*100:.1f}%)")

    # Confidence distribution
    confidences = Counter(a["annotation"].get("confidence", "unknown") for a in valid)
    print(f"\n=== LLM Confidence: {dict(confidences)} ===")

    # Save report
    report = {
        "total_annotations": len(annotations),
        "valid_annotations": len(valid),
        "circulus": {
            "llm_positive_rate": round(sum(llm_circulus) / len(llm_circulus) * 100, 1),
            "pipeline_positive_rate": round(sum(pipe_circulus) / len(pipe_circulus) * 100, 1),
            "pipeline_vs_llm": m,
            "agreement": round(agree_c / len(llm_circulus) * 100, 1),
        },
        "ignotum": {
            "llm_positive_rate": round(sum(llm_ignotum) / len(llm_ignotum) * 100, 1),
            "pipeline_positive_rate": round(sum(pipe_ignotum) / len(pipe_ignotum) * 100, 1),
            "pipeline_vs_llm": m2,
            "agreement": round(agree_i / len(llm_ignotum) * 100, 1),
        },
        "llm_confidence": dict(confidences),
    }

    with open("evaluation_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nReport saved: evaluation_report.json")


if __name__ == "__main__":
    main()
