"""
Experiment A — Norm extraction gold label validation (30 docs).

Validates the regex-based norm extraction gold labels against Claude Sonnet as judge.
Our regex: re.finditer(r'(?:стаття|ст\\.?)\\s*(\\d+)', text.lower())

For each of 30 random docs:
  1. Send full text (truncated to 8000 chars) to Claude Sonnet via Bedrock Converse API
  2. Parse the JSON response, extract article numbers
  3. Compare with regex extraction
  4. Calculate precision/recall/F1

Usage:
  cd rlhf-signals
  python analysis/exp_a_norm_validation.py
"""

import json
import random
import re
import sys
import time
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "output" / "experiment_a" / "data"
EVAL_DATA_PATH = DATA_DIR / "eval_dataset.jsonl"
NORM_VALIDATION_PATH = DATA_DIR / "norm_validation.jsonl"

JUDGE_MODEL_ID = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
JUDGE_REGION = "eu-central-1"

NORM_PROMPT = (
    "Витягни ВСІ правові норми (статті законів, кодексів), на які посилається цей текст. "
    'Відповідай у форматі JSON: [{{"law": "назва", "article": "номер"}}]'
    "\n\nТекст:\n{text}\n\nJSON:"
)

TEXT_TRUNCATION = 8000
N_SAMPLES = 30
RANDOM_SEED = 42


def extract_norms_regex(text: str) -> set[str]:
    """Our regex-based norm extractor (the one used for gold labels)."""
    norms = set()
    for m in re.finditer(r'(?:стаття|ст\.?)\s*(\d+)', text.lower()):
        norms.add(m.group(1))
    return norms


def extract_norms_from_judge_response(response: str) -> set[str]:
    """Parse article numbers from judge's JSON response."""
    norms = set()
    try:
        # Find JSON array in response
        match = re.search(r'\[.*\]', response, re.DOTALL)
        if match:
            items = json.loads(match.group())
            for item in items:
                if isinstance(item, dict):
                    art = str(item.get("article", "")).strip()
                    # Extract just the number
                    art_num = re.search(r'\d+', art)
                    if art_num:
                        norms.add(art_num.group())
    except (json.JSONDecodeError, Exception):
        pass
    return norms


def compute_prf(regex_norms: set, judge_norms: set) -> tuple[float, float, float]:
    """Compute precision/recall/F1 treating judge as ground truth."""
    if len(judge_norms) == 0 and len(regex_norms) == 0:
        return 1.0, 1.0, 1.0
    if len(judge_norms) == 0:
        return 0.0, 1.0, 0.0
    tp = len(regex_norms & judge_norms)
    precision = tp / len(regex_norms) if regex_norms else 0.0
    recall = tp / len(judge_norms) if judge_norms else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return precision, recall, f1


def main():
    if not EVAL_DATA_PATH.exists():
        print(f"ERROR: Evaluation data not found at {EVAL_DATA_PATH}")
        sys.exit(1)

    # Load samples
    print("Loading evaluation data...")
    samples = []
    with open(EVAL_DATA_PATH, "r", encoding="utf-8") as f:
        for line in f:
            samples.append(json.loads(line))
    print(f"Loaded {len(samples)} samples")

    # Select 30 random samples
    random.seed(RANDOM_SEED)
    subset = random.sample(samples, min(N_SAMPLES, len(samples)))
    print(f"Selected {len(subset)} random samples for validation")

    # Initialize Bedrock client
    print(f"Judge model: {JUDGE_MODEL_ID} ({JUDGE_REGION})")
    client = boto3.client("bedrock-runtime", region_name=JUDGE_REGION)

    # Test connection
    try:
        test_resp = client.converse(
            modelId=JUDGE_MODEL_ID,
            messages=[{"role": "user", "content": [{"text": "2+2="}]}],
            inferenceConfig={"maxTokens": 10, "temperature": 0},
        )
        test_text = test_resp["output"]["message"]["content"][0]["text"]
        print(f"Judge connection OK: {test_text}")
    except Exception as e:
        print(f"ERROR: Cannot connect to judge model: {e}")
        sys.exit(1)

    # Validate each sample
    results = []
    total_p, total_r, total_f1 = 0.0, 0.0, 0.0

    for i, sample in enumerate(subset):
        doc_id = sample["doc_id"]
        text = sample["text"][:TEXT_TRUNCATION]

        # Our regex extraction
        regex_norms = extract_norms_regex(text)

        # Judge extraction
        prompt = NORM_PROMPT.format(text=text)
        try:
            response = client.converse(
                modelId=JUDGE_MODEL_ID,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"maxTokens": 2000, "temperature": 0},
            )
            raw_answer = response["output"]["message"]["content"][0]["text"].strip()
            judge_norms = extract_norms_from_judge_response(raw_answer)
        except Exception as e:
            print(f"  [{i+1}/{N_SAMPLES}] Error on {doc_id}: {e}")
            if "ThrottlingException" in str(e) or "Too many" in str(e).lower():
                print("    Rate limited, waiting 30s...")
                time.sleep(30)
            continue

        precision, recall, f1 = compute_prf(regex_norms, judge_norms)

        result = {
            "doc_id": doc_id,
            "case_type": sample.get("case_type", ""),
            "regex_norms": sorted(regex_norms),
            "judge_norms": sorted(judge_norms),
            "regex_count": len(regex_norms),
            "judge_count": len(judge_norms),
            "overlap": len(regex_norms & judge_norms),
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
        }
        results.append(result)
        total_p += precision
        total_r += recall
        total_f1 += f1

        print(
            f"  [{i+1}/{N_SAMPLES}] {doc_id}: regex={len(regex_norms)} judge={len(judge_norms)} "
            f"overlap={len(regex_norms & judge_norms)} P={precision:.3f} R={recall:.3f} F1={f1:.3f}"
        )

        time.sleep(0.5)

    # Save results
    with open(NORM_VALIDATION_PATH, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Summary
    n_done = len(results)
    if n_done > 0:
        avg_p = total_p / n_done
        avg_r = total_r / n_done
        avg_f1 = total_f1 / n_done
        print(f"\n{'='*60}")
        print(f"  NORM EXTRACTION VALIDATION SUMMARY ({n_done} docs)")
        print(f"{'='*60}")
        print(f"  Regex: re.finditer(r'(?:стаття|ст\\.?)\\s*(\\d+)', text.lower())")
        print(f"  Judge: {JUDGE_MODEL_ID}")
        print(f"  Text truncation: {TEXT_TRUNCATION} chars")
        print(f"")
        print(f"  Mean Precision: {avg_p:.4f}")
        print(f"  Mean Recall:    {avg_r:.4f}")
        print(f"  Mean F1:        {avg_f1:.4f}")
        print(f"")
        print(f"  Results saved to: {NORM_VALIDATION_PATH}")

        # Distribution
        print(f"\n  Per-document F1 distribution:")
        f1_vals = [r["f1"] for r in results]
        bins = [(0.0, 0.25), (0.25, 0.5), (0.5, 0.75), (0.75, 1.01)]
        for lo, hi in bins:
            count = sum(1 for v in f1_vals if lo <= v < hi)
            print(f"    [{lo:.2f}, {hi:.2f}): {count}")

        # Regex-only norms (false positives in regex)
        all_fp = sum(r["regex_count"] - r["overlap"] for r in results)
        all_fn = sum(r["judge_count"] - r["overlap"] for r in results)
        all_tp = sum(r["overlap"] for r in results)
        print(f"\n  Aggregate counts:")
        print(f"    True positives (overlap): {all_tp}")
        print(f"    False positives (regex only): {all_fp}")
        print(f"    False negatives (judge only): {all_fn}")
        micro_p = all_tp / (all_tp + all_fp) if (all_tp + all_fp) else 0
        micro_r = all_tp / (all_tp + all_fn) if (all_tp + all_fn) else 0
        micro_f1 = 2 * micro_p * micro_r / (micro_p + micro_r) if (micro_p + micro_r) else 0
        print(f"    Micro-averaged P={micro_p:.4f} R={micro_r:.4f} F1={micro_f1:.4f}")


if __name__ == "__main__":
    main()
