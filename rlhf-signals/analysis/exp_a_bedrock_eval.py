"""
Experiment A — Step 3: Zero-shot & few-shot evaluation via AWS Bedrock.

Runs classification and generation tasks across all models.
Supports resuming from checkpoints.

Usage:
  cd rlhf-signals
  python analysis/exp_a_bedrock_eval.py                    # all tasks, all models
  python analysis/exp_a_bedrock_eval.py --task case_type   # single task
  python analysis/exp_a_bedrock_eval.py --model qwen3_32b  # single model
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exp_a_config import (
    MODELS, EVAL_TASKS, EVAL_DATA_PATH, RESULTS_DIR,
    TEXT_TRUNCATE_TOKENS, CASE_TYPE_CLASSES, OUTCOME_CLASSES,
)

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / EVAL_DATA_PATH
RESULTS_PATH = ROOT / RESULTS_DIR


def truncate_text(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return text[:half] + "\n\n[...]\n\n" + text[-half:]


def build_messages(task_key: str, text: str, mode: str = "zero_shot") -> list[dict]:
    task = EVAL_TASKS[task_key]
    messages = []

    if mode == "few_shot" and task.few_shot_examples:
        for ex in task.few_shot_examples:
            messages.append({
                "role": "user",
                "content": task.user_template.format(text=ex["text"]),
            })
            messages.append({
                "role": "assistant",
                "content": ex["answer"],
            })

    messages.append({
        "role": "user",
        "content": task.user_template.format(text=truncate_text(text)),
    })

    return messages


def _build_llama_prompt(messages: list[dict], system_prompt: str) -> str:
    """Build a Llama 3 chat-formatted prompt string from messages."""
    parts = ["<|begin_of_text|>"]
    if system_prompt:
        parts.append(f"<|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|>")
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        parts.append(f"<|start_header_id|>{role}<|end_header_id|>\n\n{content}<|eot_id|>")
    parts.append("<|start_header_id|>assistant<|end_header_id|>\n\n")
    return "".join(parts)


def _build_nova_messages(messages: list[dict]) -> list[dict]:
    """Convert plain-text messages to Amazon Nova content-block format."""
    nova_msgs = []
    for msg in messages:
        content = msg["content"]
        if isinstance(content, str):
            content = [{"text": content}]
        nova_msgs.append({"role": msg["role"], "content": content})
    return nova_msgs


def invoke_bedrock(client, model_cfg, messages: list[dict], system_prompt: str) -> dict:
    if model_cfg.provider == "Meta":
        # Llama models on Bedrock use prompt-based format, not messages
        prompt = _build_llama_prompt(messages, system_prompt)
        body = {
            "prompt": prompt,
            "max_gen_len": 512,
            "temperature": 0.0,
        }
    elif model_cfg.provider == "Amazon":
        # Amazon Nova models use their own schema with inferenceConfig
        body = {
            "schemaVersion": "messages-v1",
            "messages": _build_nova_messages(messages),
            "inferenceConfig": {
                "maxTokens": 512,
                "temperature": 0.0,
            },
        }
        if system_prompt:
            body["system"] = [{"text": system_prompt}]
    else:
        body = {
            "messages": messages,
            "max_tokens": 512,
            "temperature": 0.0,
        }
        if system_prompt:
            body["system"] = system_prompt

    response = client.invoke_model(
        modelId=model_cfg.model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    resp_body = json.loads(response["body"].read())

    output_text = ""
    if "generation" in resp_body:
        output_text = resp_body["generation"]
    elif "output" in resp_body and isinstance(resp_body["output"], dict):
        # Amazon Nova response: output.message.content[0].text
        msg = resp_body["output"].get("message", {})
        content = msg.get("content", [])
        if content and isinstance(content, list):
            output_text = content[0].get("text", "")
    elif "content" in resp_body and isinstance(resp_body["content"], list):
        output_text = resp_body["content"][0].get("text", "")
    elif "choices" in resp_body:
        output_text = resp_body["choices"][0].get("message", {}).get("content", "")
    elif "outputs" in resp_body:
        output_text = resp_body["outputs"][0].get("text", "")

    usage = resp_body.get("usage", {})
    input_tokens = (
        usage.get("input_tokens")
        or usage.get("inputTokens")
        or usage.get("prompt_tokens")
        or resp_body.get("prompt_token_count", 0)
    )
    output_tokens = (
        usage.get("output_tokens")
        or usage.get("outputTokens")
        or usage.get("completion_tokens")
        or resp_body.get("generation_token_count", 0)
    )

    return {
        "text": output_text.strip(),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }


def normalize_answer(answer: str, valid_classes: list[str]) -> str:
    answer_lower = answer.lower().strip().rstrip(".")
    for cls in valid_classes:
        if cls in answer_lower:
            return cls
    return answer_lower


def score_classification(prediction: str, gold: str, valid_classes: list[str]) -> dict:
    pred_norm = normalize_answer(prediction, valid_classes)
    gold_norm = gold.lower().strip()
    return {
        "correct": pred_norm == gold_norm,
        "predicted": pred_norm,
        "gold": gold_norm,
    }


def score_norm_extraction(prediction: str, gold_text: str) -> dict:
    try:
        match = re.search(r'\[.*\]', prediction, re.DOTALL)
        if match:
            predicted_norms = json.loads(match.group())
        else:
            predicted_norms = []
    except json.JSONDecodeError:
        predicted_norms = []

    gold_norms = set()
    for m in re.finditer(r'(?:стаття|ст\.?)\s*(\d+)', gold_text.lower()):
        gold_norms.add(m.group(1))

    pred_articles = set()
    for norm in predicted_norms:
        if isinstance(norm, dict):
            art = str(norm.get("article", "")).strip()
            art_num = re.search(r'\d+', art)
            if art_num:
                pred_articles.add(art_num.group())

    if not gold_norms:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0, "pred_count": len(pred_articles), "gold_count": 0}

    tp = len(pred_articles & gold_norms)
    precision = tp / len(pred_articles) if pred_articles else 0
    recall = tp / len(gold_norms) if gold_norms else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    return {"precision": precision, "recall": recall, "f1": f1, "pred_count": len(pred_articles), "gold_count": len(gold_norms)}


def load_checkpoint(checkpoint_path: Path) -> dict:
    if checkpoint_path.exists():
        with open(checkpoint_path, "r") as f:
            return json.load(f)
    return {}


def save_checkpoint(checkpoint_path: Path, data: dict):
    with open(checkpoint_path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def run_eval(model_key: str, task_key: str, samples: list[dict], mode: str):
    cfg = MODELS[model_key]
    task = EVAL_TASKS[task_key]

    checkpoint_path = RESULTS_PATH / f"checkpoint_{model_key}_{task_key}_{mode}.json"
    checkpoint = load_checkpoint(checkpoint_path)
    completed_ids = set(checkpoint.get("completed_ids", []))

    client = boto3.client("bedrock-runtime", region_name=cfg.region)

    results = checkpoint.get("results", [])
    total_input_tokens = checkpoint.get("total_input_tokens", 0)
    total_output_tokens = checkpoint.get("total_output_tokens", 0)
    errors = checkpoint.get("errors", 0)

    pending = [s for s in samples if s["doc_id"] not in completed_ids]

    if not pending:
        print(f"    All {len(samples)} samples already completed")
        return checkpoint

    print(f"    {len(pending)} remaining ({len(completed_ids)} already done)")

    for i, sample in enumerate(pending):
        messages = build_messages(task_key, sample["text"], mode)

        try:
            response = invoke_bedrock(client, cfg, messages, task.system_prompt)

            result_entry = {
                "doc_id": sample["doc_id"],
                "model": model_key,
                "task": task_key,
                "mode": mode,
                "response": response["text"],
                "input_tokens": response["input_tokens"],
                "output_tokens": response["output_tokens"],
            }

            if task.metric == "accuracy":
                valid = CASE_TYPE_CLASSES if task_key == "case_type" else OUTCOME_CLASSES
                gold = sample["case_type"] if task_key == "case_type" else sample["outcome"]
                score = score_classification(response["text"], gold, valid)
                result_entry.update(score)
            elif task.metric == "f1":
                score = score_norm_extraction(response["text"], sample["text"])
                result_entry.update(score)
            elif task.metric == "llm_judge":
                result_entry["summary"] = response["text"]

            results.append(result_entry)
            total_input_tokens += response["input_tokens"]
            total_output_tokens += response["output_tokens"]
            completed_ids.add(sample["doc_id"])

        except Exception as e:
            errors += 1
            print(f"    Error on {sample['doc_id']}: {e}")
            if "ThrottlingException" in str(e):
                print("    Rate limited, waiting 30s...")
                time.sleep(30)
            continue

        if (i + 1) % 10 == 0:
            save_checkpoint(checkpoint_path, {
                "completed_ids": list(completed_ids),
                "results": results,
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
                "errors": errors,
            })
            print(f"    {i + 1}/{len(pending)} — checkpoint saved")

        time.sleep(0.3)

    final = {
        "model": model_key,
        "task": task_key,
        "mode": mode,
        "display_name": cfg.display_name,
        "completed_ids": list(completed_ids),
        "results": results,
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "errors": errors,
        "cost_usd": (
            total_input_tokens * cfg.cost_per_1k_input / 1000 +
            total_output_tokens * cfg.cost_per_1k_output / 1000
        ),
    }

    save_checkpoint(checkpoint_path, final)

    if task.metric == "accuracy":
        correct = sum(1 for r in results if r.get("correct"))
        total = len(results)
        if total > 0:
            print(f"    Accuracy: {correct}/{total} = {correct/total:.1%}")
        else:
            print(f"    Accuracy: no results (all errored)")
    elif task.metric == "f1":
        avg_f1 = sum(r.get("f1", 0) for r in results) / len(results) if results else 0
        print(f"    Avg F1: {avg_f1:.3f}")

    print(f"    Cost: ${final['cost_usd']:.4f}")

    return final


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=list(MODELS.keys()), help="Run single model")
    parser.add_argument("--task", choices=list(EVAL_TASKS.keys()), help="Run single task")
    parser.add_argument("--mode", choices=["zero_shot", "few_shot", "both"], default="both")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of samples (0=all)")
    args = parser.parse_args()

    if not DATA_PATH.exists():
        print(f"ERROR: Evaluation data not found at {DATA_PATH}")
        print("Run exp_a_extract_eval.py first.")
        sys.exit(1)

    print("Loading evaluation data...")
    samples = []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        for line in f:
            samples.append(json.loads(line))

    if args.limit > 0:
        samples = samples[:args.limit]
    print(f"Using {len(samples)} samples")

    model_keys = [args.model] if args.model else list(MODELS.keys())
    task_keys = [args.task] if args.task else list(EVAL_TASKS.keys())
    modes = ["zero_shot", "few_shot"] if args.mode == "both" else [args.mode]

    all_results = {}
    total_cost = 0.0

    for model_key in model_keys:
        for task_key in task_keys:
            for mode in modes:
                task_name = EVAL_TASKS[task_key].name
                model_name = MODELS[model_key].display_name
                print(f"\n{'='*60}")
                print(f"  {model_name} | {task_name} | {mode}")
                print(f"{'='*60}")

                result = run_eval(model_key, task_key, samples, mode)
                key = f"{model_key}__{task_key}__{mode}"
                all_results[key] = result
                total_cost += result.get("cost_usd", 0)

    output_path = RESULTS_PATH / "eval_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"Total cost: ${total_cost:.4f}")
    print(f"Results saved to: {output_path}")

    print(f"\n{'Model':<25} {'Task':<20} {'Mode':<12} {'Score':>10} {'Cost':>8}")
    print("-" * 77)
    for key, result in all_results.items():
        model_key, task_key, mode = key.split("__")
        task = EVAL_TASKS[task_key]
        model_name = MODELS[model_key].display_name[:24]

        score_str = ""
        if task.metric == "accuracy":
            correct = sum(1 for r in result["results"] if r.get("correct"))
            total = len(result["results"])
            score_str = f"{correct/total:.1%}" if total else "N/A"
        elif task.metric == "f1":
            avg_f1 = sum(r.get("f1", 0) for r in result["results"]) / len(result["results"]) if result["results"] else 0
            score_str = f"{avg_f1:.3f}"
        elif task.metric == "llm_judge":
            score_str = "pending"

        cost_str = f"${result.get('cost_usd', 0):.4f}"
        print(f"{model_name:<25} {task_key:<20} {mode:<12} {score_str:>10} {cost_str:>8}")


if __name__ == "__main__":
    main()
