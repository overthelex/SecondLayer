"""
Experiment A — Gold label validation using AWS Bedrock as an independent judge.

Validates:
  1. outcome labels (all 300 samples) — regex-extracted vs LLM judge
  2. norm_extraction labels (30 random samples) — regex-extracted vs LLM judge

Uses Claude Sonnet 4 via Bedrock Converse API as the judge model.
Falls back to Mistral Large 3 if Claude is unavailable.

Usage:
  cd rlhf-signals
  python analysis/exp_a_validate_labels.py
"""

import json
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "output" / "experiment_a" / "data"
EVAL_DATA_PATH = DATA_DIR / "eval_dataset.jsonl"
VALIDATION_PATH = DATA_DIR / "label_validation.jsonl"
VALIDATED_DATASET_PATH = DATA_DIR / "eval_dataset_validated.jsonl"
NORM_VALIDATION_PATH = DATA_DIR / "norm_validation.jsonl"
CHECKPOINT_PATH = DATA_DIR / "label_validation_checkpoint.json"

# Judge model config — try Claude Sonnet 4 first, fall back to Mistral Large 3
JUDGE_MODELS = [
    {
        "model_id": "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "region": "eu-central-1",
        "name": "Claude Sonnet 4.5",
    },
    {
        "model_id": "mistral.mistral-large-3-675b-instruct",
        "region": "us-east-1",
        "name": "Mistral Large 3",
    },
]

OUTCOME_PROMPT = """Прочитай резолютивну частину судового рішення і визнач результат розгляду справи.
Відповідай ОДНИМ з варіантів: задоволено, відмовлено, частково задоволено, закрито, залишено без розгляду.
Якщо не можеш визначити — відповідай "невизначено".

Текст:
{text}

Результат:"""

NORM_EXTRACTION_PROMPT = """Витягни ВСІ правові норми (статті законів, кодексів), на які посилається цей текст судового рішення.
Відповідай у форматі JSON масиву: [{{"law": "назва закону/кодексу", "article": "номер статті"}}]
Якщо норм немає — відповідай [].

Текст:
{text}

Правові норми (JSON):"""

VALID_OUTCOMES = [
    "частково задоволено",  # must be before "задоволено" for substring matching
    "залишено без розгляду",
    "задоволено", "відмовлено",
    "закрито",
]


def select_judge_model():
    """Try each judge model until one works."""
    for model_cfg in JUDGE_MODELS:
        try:
            client = boto3.client("bedrock-runtime", region_name=model_cfg["region"])
            response = client.converse(
                modelId=model_cfg["model_id"],
                messages=[{"role": "user", "content": [{"text": "Тест: 2+2="}]}],
                inferenceConfig={"maxTokens": 10, "temperature": 0},
            )
            text = response["output"]["message"]["content"][0]["text"]
            print(f"Judge model: {model_cfg['name']} ({model_cfg['model_id']}) -- test OK: {text}")
            return model_cfg, client
        except Exception as e:
            print(f"  {model_cfg['name']} unavailable: {e}")
    print("ERROR: No judge model available!")
    sys.exit(1)


def call_judge(client, model_cfg, prompt: str, max_tokens: int = 20) -> str:
    """Call the judge model via Bedrock Converse API."""
    response = client.converse(
        modelId=model_cfg["model_id"],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0},
    )
    return response["output"]["message"]["content"][0]["text"].strip()


def normalize_outcome(raw: str) -> str:
    """Normalize judge response to one of the valid outcomes."""
    raw_lower = raw.lower().strip().rstrip(".").strip()
    # Direct match
    for outcome in VALID_OUTCOMES:
        if outcome in raw_lower:
            return outcome
    # Partial matches
    if "частков" in raw_lower:
        return "частково задоволено"
    if "задовол" in raw_lower:
        return "задоволено"
    if "відмов" in raw_lower:
        return "відмовлено"
    if "закри" in raw_lower:
        return "закрито"
    if "залиш" in raw_lower or "без розгляду" in raw_lower:
        return "залишено без розгляду"
    return "невизначено"


def load_checkpoint() -> dict:
    """Load checkpoint if exists."""
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed_ids": [], "results": []}


def save_checkpoint(data: dict):
    """Save checkpoint."""
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_norms_regex(text: str) -> set:
    """Extract legal norm references from text using regex."""
    norms = set()
    # Pattern: ст. N, стаття N, ст.ст. N, N-1
    # Match article numbers with optional sub-articles
    for m in re.finditer(
        r'(?:стаття|статті|статтею|статей|ст\.?\s*(?:ст\.?)?\s*)(\d+(?:[.-]\d+)?)',
        text.lower()
    ):
        norms.add(m.group(1))
    return norms


def extract_norms_from_judge(response: str) -> set:
    """Parse norm extraction from judge's JSON response."""
    norms = set()
    try:
        match = re.search(r'\[.*\]', response, re.DOTALL)
        if match:
            items = json.loads(match.group())
            for item in items:
                if isinstance(item, dict):
                    art = str(item.get("article", "")).strip()
                    art_num = re.search(r'\d+(?:[.-]\d+)?', art)
                    if art_num:
                        norms.add(art_num.group())
    except (json.JSONDecodeError, Exception):
        pass
    return norms


# ─────────────────────────────────────────────────────────────
# Part 1: Outcome validation
# ─────────────────────────────────────────────────────────────

def validate_outcomes(samples: list[dict], model_cfg: dict, client):
    """Validate outcome labels for all samples."""
    print(f"\n{'='*60}")
    print(f"  OUTCOME LABEL VALIDATION ({len(samples)} samples)")
    print(f"{'='*60}")

    checkpoint = load_checkpoint()
    completed_ids = set(checkpoint.get("completed_ids", []))
    results = checkpoint.get("results", [])

    pending = [s for s in samples if s["doc_id"] not in completed_ids]
    print(f"  {len(pending)} remaining ({len(completed_ids)} already done)")

    for i, sample in enumerate(pending):
        doc_id = sample["doc_id"]
        text_tail = sample["text"][-3000:]
        prompt = OUTCOME_PROMPT.format(text=text_tail)

        try:
            raw_answer = call_judge(client, model_cfg, prompt, max_tokens=20)
            judge_outcome = normalize_outcome(raw_answer)

            result = {
                "doc_id": doc_id,
                "case_number": sample.get("case_number", ""),
                "case_type": sample.get("case_type", ""),
                "regex_outcome": sample["outcome"],
                "judge_outcome": judge_outcome,
                "judge_raw": raw_answer,
                "status": "validated" if judge_outcome == sample["outcome"] else "disputed",
            }
            results.append(result)
            completed_ids.add(doc_id)

            status_mark = "OK" if result["status"] == "validated" else "DISPUTE"
            if result["status"] == "disputed":
                print(f"  [{i+1+len(checkpoint.get('completed_ids',[]))}] {doc_id}: {status_mark} "
                      f"(regex={sample['outcome']}, judge={judge_outcome}, raw='{raw_answer}')")

        except Exception as e:
            print(f"  [{i+1}] Error on {doc_id}: {e}")
            if "ThrottlingException" in str(e) or "Too many" in str(e).lower():
                print("    Rate limited, waiting 30s...")
                time.sleep(30)
            continue

        # Checkpoint every 50 samples
        if (len(completed_ids)) % 50 == 0:
            save_checkpoint({"completed_ids": list(completed_ids), "results": results})
            done = len(completed_ids)
            total = len(samples)
            agreed = sum(1 for r in results if r["status"] == "validated")
            print(f"  --- Checkpoint: {done}/{total} done, agreement so far: {agreed}/{done} ({agreed/done:.1%}) ---")

        time.sleep(0.5)

    # Final save
    save_checkpoint({"completed_ids": list(completed_ids), "results": results})
    return results


def print_outcome_summary(results: list[dict]):
    """Print summary statistics for outcome validation."""
    print(f"\n{'='*60}")
    print(f"  OUTCOME VALIDATION SUMMARY")
    print(f"{'='*60}")

    total = len(results)
    validated = sum(1 for r in results if r["status"] == "validated")
    disputed = sum(1 for r in results if r["status"] == "disputed")

    print(f"  Total samples:    {total}")
    print(f"  Validated (agree): {validated} ({validated/total:.1%})")
    print(f"  Disputed (disagree): {disputed} ({disputed/total:.1%})")

    if disputed > 0:
        print(f"\n  Disagreement breakdown:")
        disagreements = defaultdict(int)
        for r in results:
            if r["status"] == "disputed":
                key = f"{r['regex_outcome']} -> {r['judge_outcome']}"
                disagreements[key] += 1
        for key, count in sorted(disagreements.items(), key=lambda x: -x[1]):
            print(f"    {key}: {count}")


def create_validated_dataset(samples: list[dict], results: list[dict]):
    """Create cleaned dataset with only validated samples."""
    disputed_ids = {r["doc_id"] for r in results if r["status"] == "disputed"}
    validated_samples = [s for s in samples if s["doc_id"] not in disputed_ids]

    with open(VALIDATED_DATASET_PATH, "w", encoding="utf-8") as f:
        for sample in validated_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    print(f"\n{'='*60}")
    print(f"  VALIDATED DATASET")
    print(f"{'='*60}")
    print(f"  Original samples:  {len(samples)}")
    print(f"  Removed (disputed): {len(disputed_ids)}")
    print(f"  Remaining:         {len(validated_samples)}")
    print(f"  Saved to: {VALIDATED_DATASET_PATH}")

    # Breakdown by case_type
    print(f"\n  By case_type:")
    ct_counts = Counter(s["case_type"] for s in validated_samples)
    for ct, count in sorted(ct_counts.items()):
        print(f"    {ct}: {count}")

    # Breakdown by outcome
    print(f"\n  By outcome:")
    oc_counts = Counter(s["outcome"] for s in validated_samples)
    for oc, count in sorted(oc_counts.items(), key=lambda x: -x[1]):
        print(f"    {oc}: {count}")

    return validated_samples


# ─────────────────────────────────────────────────────────────
# Part 2: Norm extraction validation (30 samples)
# ─────────────────────────────────────────────────────────────

def validate_norm_extraction(samples: list[dict], model_cfg: dict, client, n: int = 30):
    """Validate norm extraction on a random subset."""
    print(f"\n{'='*60}")
    print(f"  NORM EXTRACTION VALIDATION ({n} samples)")
    print(f"{'='*60}")

    random.seed(42)
    subset = random.sample(samples, min(n, len(samples)))

    results = []
    total_precision = 0.0
    total_recall = 0.0
    total_f1 = 0.0

    for i, sample in enumerate(subset):
        doc_id = sample["doc_id"]
        text = sample["text"]

        # Our regex extraction
        regex_norms = extract_norms_regex(text)

        # Judge extraction
        prompt = NORM_EXTRACTION_PROMPT.format(text=text)
        try:
            raw_answer = call_judge(client, model_cfg, prompt, max_tokens=2000)
            judge_norms = extract_norms_from_judge(raw_answer)
        except Exception as e:
            print(f"  [{i+1}] Error on {doc_id}: {e}")
            if "ThrottlingException" in str(e):
                time.sleep(30)
            continue

        # Compute precision/recall treating judge as ground truth
        if len(judge_norms) == 0 and len(regex_norms) == 0:
            precision = 1.0
            recall = 1.0
            f1 = 1.0
        elif len(judge_norms) == 0:
            precision = 0.0
            recall = 1.0  # nothing to recall
            f1 = 0.0
        else:
            tp = len(regex_norms & judge_norms)
            precision = tp / len(regex_norms) if regex_norms else 0.0
            recall = tp / len(judge_norms) if judge_norms else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

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
        total_precision += precision
        total_recall += recall
        total_f1 += f1

        print(f"  [{i+1}/{n}] {doc_id}: regex={len(regex_norms)} judge={len(judge_norms)} "
              f"overlap={len(regex_norms & judge_norms)} P={precision:.2f} R={recall:.2f} F1={f1:.2f}")

        time.sleep(0.5)

    # Save results
    with open(NORM_VALIDATION_PATH, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    n_done = len(results)
    if n_done > 0:
        avg_p = total_precision / n_done
        avg_r = total_recall / n_done
        avg_f1 = total_f1 / n_done
        print(f"\n  NORM EXTRACTION SUMMARY ({n_done} samples):")
        print(f"    Avg Precision: {avg_p:.3f}")
        print(f"    Avg Recall:    {avg_r:.3f}")
        print(f"    Avg F1:        {avg_f1:.3f}")
        print(f"    Results saved to: {NORM_VALIDATION_PATH}")

    return results


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

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

    # Select judge model
    model_cfg, client = select_judge_model()

    # Part 1: Validate outcome labels
    outcome_results = validate_outcomes(samples, model_cfg, client)
    print_outcome_summary(outcome_results)

    # Save full validation results
    with open(VALIDATION_PATH, "w", encoding="utf-8") as f:
        for r in outcome_results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\n  Full validation results saved to: {VALIDATION_PATH}")

    # Create validated dataset
    create_validated_dataset(samples, outcome_results)

    # Part 2: Validate norm extraction
    norm_results = validate_norm_extraction(samples, model_cfg, client, n=30)

    print(f"\n{'='*60}")
    print(f"  ALL DONE")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
