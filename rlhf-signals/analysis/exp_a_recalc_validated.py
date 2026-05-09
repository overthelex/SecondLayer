"""
Experiment A — Recalculate scores on validated dataset.

Loads eval_dataset_final.jsonl (273 samples after majority vote label validation),
re-scores each model checkpoint against the validated labels, and produces a
comparison table of original (300-sample) vs validated (273-sample) scores.

Scored tasks:
  - case_type: zero_shot, few_shot  (accuracy)
  - case_outcome: zero_shot, few_shot  (accuracy)
  - norm_extraction: zero_shot, few_shot  (precision, recall, F1)

Models: qwen3_32b, llama33_70b, mistral_large3, llama4_maverick,
        qwen3_235b, nemotron_120b, nova_pro

Usage:
  cd rlhf-signals
  python analysis/exp_a_recalc_validated.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "output" / "experiment_a" / "data"
CHECKPOINT_DIR = ROOT / "output" / "experiment_a"
FINAL_DATASET_PATH = DATA_DIR / "eval_dataset_final.jsonl"
OUTPUT_PATH = CHECKPOINT_DIR / "validated_scores.json"

MODELS = [
    "qwen3_32b", "llama33_70b", "mistral_large3", "llama4_maverick",
    "qwen3_235b", "nemotron_120b", "nova_pro",
]

TASKS = [
    ("case_type", "zero_shot"),
    ("case_type", "few_shot"),
    ("case_outcome", "zero_shot"),
    ("case_outcome", "few_shot"),
    ("norm_extraction", "zero_shot"),
    ("norm_extraction", "few_shot"),
]


def load_validated_dataset() -> dict:
    """Load the validated dataset, return dict keyed by doc_id."""
    if not FINAL_DATASET_PATH.exists():
        print(f"ERROR: Validated dataset not found at {FINAL_DATASET_PATH}")
        sys.exit(1)

    docs = {}
    with open(FINAL_DATASET_PATH, "r", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            docs[str(d["doc_id"])] = d
    print(f"Loaded {len(docs)} validated samples from {FINAL_DATASET_PATH.name}")
    return docs


def load_checkpoint(model: str, task: str, mode: str) -> dict | None:
    """Load a checkpoint file, return None if not found."""
    path = CHECKPOINT_DIR / f"checkpoint_{model}_{task}_{mode}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def score_case_task(results: list[dict], validated_docs: dict, task: str, use_corrected_labels: bool) -> dict:
    """Score case_type or case_outcome, filtering to validated doc_ids.

    For case_outcome with use_corrected_labels=True, re-scores against the
    corrected outcome label from eval_dataset_final.jsonl.
    """
    filtered = [r for r in results if str(r["doc_id"]) in validated_docs]
    n = len(filtered)
    if n == 0:
        return {"n": 0, "accuracy": 0.0}

    correct = 0
    corrections = 0
    for r in filtered:
        doc_id = str(r["doc_id"])
        predicted = r.get("predicted", "")

        if use_corrected_labels and task == "case_outcome":
            gold = validated_docs[doc_id]["outcome"]
            # Check if original gold was different
            orig_gold = r.get("gold", "")
            if orig_gold != gold:
                corrections += 1
            is_correct = (predicted.lower().strip() == gold.lower().strip())
        else:
            gold = r.get("gold", "")
            is_correct = r.get("correct", False)

        if is_correct:
            correct += 1

    return {
        "n": n,
        "accuracy": round(correct / n, 4),
        "correct": correct,
        "corrections_applied": corrections if use_corrected_labels else 0,
    }


def score_norm_extraction(results: list[dict], validated_docs: dict) -> dict:
    """Score norm_extraction, filtering to validated doc_ids."""
    filtered = [r for r in results if str(r["doc_id"]) in validated_docs]
    n = len(filtered)
    if n == 0:
        return {"n": 0, "precision": 0.0, "recall": 0.0, "f1": 0.0}

    total_p = sum(r.get("precision", 0) for r in filtered)
    total_r = sum(r.get("recall", 0) for r in filtered)
    total_f1 = sum(r.get("f1", 0) for r in filtered)

    return {
        "n": n,
        "precision": round(total_p / n, 4),
        "recall": round(total_r / n, 4),
        "f1": round(total_f1 / n, 4),
    }


def main():
    validated_docs = load_validated_dataset()
    validated_ids = set(validated_docs.keys())

    all_scores = {}
    comparison_rows = []

    for model in MODELS:
        for task, mode in TASKS:
            cp = load_checkpoint(model, task, mode)
            if cp is None:
                print(f"  SKIP: checkpoint not found for {model}/{task}/{mode}")
                continue

            results = cp.get("results", [])
            n_original = len(results)

            # Original scores (all 300 samples)
            if task in ("case_type", "case_outcome"):
                orig_correct = sum(1 for r in results if r.get("correct"))
                orig_accuracy = orig_correct / n_original if n_original else 0
                orig_scores = {"accuracy": round(orig_accuracy, 4), "n": n_original}
            else:
                orig_p = sum(r.get("precision", 0) for r in results) / n_original if n_original else 0
                orig_r = sum(r.get("recall", 0) for r in results) / n_original if n_original else 0
                orig_f1 = sum(r.get("f1", 0) for r in results) / n_original if n_original else 0
                orig_scores = {
                    "precision": round(orig_p, 4),
                    "recall": round(orig_r, 4),
                    "f1": round(orig_f1, 4),
                    "n": n_original,
                }

            # Validated scores (273 samples, with corrected labels for case_outcome)
            if task in ("case_type", "case_outcome"):
                val_scores = score_case_task(
                    results, validated_docs, task,
                    use_corrected_labels=(task == "case_outcome"),
                )
            else:
                val_scores = score_norm_extraction(results, validated_docs)

            key = f"{model}__{task}__{mode}"
            all_scores[key] = {
                "model": model,
                "task": task,
                "mode": mode,
                "original": orig_scores,
                "validated": val_scores,
            }

            # Build comparison row
            if task in ("case_type", "case_outcome"):
                delta = val_scores["accuracy"] - orig_scores["accuracy"]
                comparison_rows.append({
                    "model": model,
                    "task": task,
                    "mode": mode,
                    "metric": "accuracy",
                    "orig_n": orig_scores["n"],
                    "orig_val": orig_scores["accuracy"],
                    "val_n": val_scores["n"],
                    "val_val": val_scores["accuracy"],
                    "delta": round(delta, 4),
                    "corrections": val_scores.get("corrections_applied", 0),
                })
            else:
                for metric in ("precision", "recall", "f1"):
                    delta = val_scores[metric] - orig_scores[metric]
                    comparison_rows.append({
                        "model": model,
                        "task": task,
                        "mode": mode,
                        "metric": metric,
                        "orig_n": orig_scores["n"],
                        "orig_val": orig_scores[metric],
                        "val_n": val_scores["n"],
                        "val_val": val_scores[metric],
                        "delta": round(delta, 4),
                    })

    # Save results
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_scores, f, ensure_ascii=False, indent=2)
    print(f"\nValidated scores saved to: {OUTPUT_PATH}")

    # Print comparison tables
    print(f"\n{'='*100}")
    print(f"  COMPARISON: Original (300 samples) vs Validated (273 samples)")
    print(f"{'='*100}")

    # Group by task
    for task, mode in TASKS:
        print(f"\n  --- {task} / {mode} ---")

        if task in ("case_type", "case_outcome"):
            print(f"  {'Model':<20} {'Orig Acc':>10} {'Val Acc':>10} {'Delta':>8} {'Corrections':>12}")
            print(f"  {'-'*20} {'-'*10} {'-'*10} {'-'*8} {'-'*12}")
            for row in comparison_rows:
                if row["task"] == task and row["mode"] == mode and row["metric"] == "accuracy":
                    corr = row.get("corrections", "")
                    delta_str = f"{row['delta']:+.4f}" if row["delta"] != 0 else "  0.0"
                    print(f"  {row['model']:<20} {row['orig_val']:>10.4f} {row['val_val']:>10.4f} {delta_str:>8} {str(corr):>12}")
        else:
            print(f"  {'Model':<20} {'Metric':<10} {'Orig':>10} {'Val':>10} {'Delta':>8}")
            print(f"  {'-'*20} {'-'*10} {'-'*10} {'-'*10} {'-'*8}")
            for row in comparison_rows:
                if row["task"] == task and row["mode"] == mode:
                    delta_str = f"{row['delta']:+.4f}" if row["delta"] != 0 else "  0.0"
                    print(f"  {row['model']:<20} {row['metric']:<10} {row['orig_val']:>10.4f} {row['val_val']:>10.4f} {delta_str:>8}")

    # Summary: biggest movers
    print(f"\n{'='*100}")
    print(f"  BIGGEST SCORE CHANGES (case_outcome)")
    print(f"{'='*100}")
    outcome_rows = [r for r in comparison_rows if r["task"] == "case_outcome" and r["metric"] == "accuracy"]
    for row in sorted(outcome_rows, key=lambda x: abs(x["delta"]), reverse=True):
        print(f"  {row['model']:<20} {row['mode']:<10} delta={row['delta']:+.4f}  "
              f"({row['orig_val']:.4f} -> {row['val_val']:.4f}, {row.get('corrections', 0)} labels corrected)")


if __name__ == "__main__":
    main()
