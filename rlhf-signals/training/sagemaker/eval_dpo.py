"""
Evaluation harness for DPO experiment.
Compares outputs from 4 conditions using LLM-as-judge win-rate.

Usage:
  python eval_dpo.py --condition-a output/practitioner/ --condition-b output/rlaif/ \
    --eval-data data/eval.jsonl --judge bedrock
"""

import json
import random
import argparse
from pathlib import Path
from collections import Counter

import boto3


JUDGE_SYSTEM = "You are an expert evaluator. Compare two AI assistant responses and determine which is better."

JUDGE_PROMPT = """Given a user request and two assistant responses (A and B), determine which response is better.

Evaluate based on:
1. Accuracy and correctness
2. Completeness
3. Clarity and structure
4. Relevance to the request

User Request:
{prompt}

Response A:
{response_a}

Response B:
{response_b}

Which response is better? Answer with ONLY one word: "A", "B", or "TIE".
Verdict:"""


def judge_pair_bedrock(client, prompt, response_a, response_b, model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0"):
    judge_input = JUDGE_PROMPT.format(prompt=prompt, response_a=response_a, response_b=response_b)
    try:
        resp = client.converse(
            modelId=model_id,
            system=[{"text": JUDGE_SYSTEM}],
            messages=[{"role": "user", "content": [{"text": judge_input}]}],
            inferenceConfig={"maxTokens": 5, "temperature": 0.0},
        )
        verdict = resp["output"]["message"]["content"][0]["text"].strip().upper()
        if verdict in ("A", "B", "TIE"):
            return verdict
        return "TIE"
    except Exception as e:
        print(f"  Judge error: {e}")
        return "ERROR"


def generate_response(client, model_id, prompt, max_tokens=512):
    """Generate response from a Bedrock model (for stock baseline)."""
    try:
        resp = client.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.7},
        )
        return resp["output"]["message"]["content"][0]["text"]
    except Exception as e:
        return f"[ERROR: {e}]"


def evaluate_win_rate(eval_data, responses_a, responses_b, client, label_a="A", label_b="B"):
    results = Counter()
    details = []

    for i, (item, ra, rb) in enumerate(zip(eval_data, responses_a, responses_b)):
        prompt = item["prompt"]

        # Randomize position to reduce bias
        if random.random() > 0.5:
            first, second = ra, rb
            mapping = {"A": label_a, "B": label_b}
        else:
            first, second = rb, ra
            mapping = {"A": label_b, "B": label_a}

        verdict = judge_pair_bedrock(client, prompt, first, second)

        if verdict in ("A", "B"):
            winner = mapping[verdict]
        elif verdict == "TIE":
            winner = "TIE"
        else:
            winner = "ERROR"

        results[winner] += 1
        details.append({"prompt_idx": i, "verdict": verdict, "winner": winner})

        if (i + 1) % 20 == 0:
            print(f"  [{i+1}/{len(eval_data)}] judged")

    total = sum(v for k, v in results.items() if k != "ERROR")
    print(f"\n  Win rate: {label_a}={results[label_a]}/{total} ({100*results[label_a]/total:.1f}%), "
          f"{label_b}={results[label_b]}/{total} ({100*results[label_b]/total:.1f}%), "
          f"TIE={results['TIE']}/{total} ({100*results['TIE']/total:.1f}%)")

    return {"counts": dict(results), "details": details, "labels": [label_a, label_b]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval-data", required=True, help="Eval JSONL (prompt/chosen/rejected)")
    parser.add_argument("--responses-a", help="JSONL with responses from model A")
    parser.add_argument("--responses-b", help="JSONL with responses from model B")
    parser.add_argument("--label-a", default="A")
    parser.add_argument("--label-b", default="B")
    parser.add_argument("--output", default="eval_results.json")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)

    eval_data = [json.loads(l) for l in Path(args.eval_data).read_text().splitlines()]
    if args.limit and len(eval_data) > args.limit:
        eval_data = random.sample(eval_data, args.limit)

    responses_a = [json.loads(l)["response"] for l in Path(args.responses_a).read_text().splitlines()]
    responses_b = [json.loads(l)["response"] for l in Path(args.responses_b).read_text().splitlines()]

    client = boto3.client("bedrock-runtime", region_name="us-east-1")

    print(f"Evaluating {len(eval_data)} pairs: {args.label_a} vs {args.label_b}")
    results = evaluate_win_rate(eval_data, responses_a, responses_b, client, args.label_a, args.label_b)

    Path(args.output).write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {args.output}")


if __name__ == "__main__":
    main()
