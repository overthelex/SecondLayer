#!/usr/bin/env python3
"""
Judge response pairs using multi-LLM panel.

Three judges (GPT-4o via Bedrock, Claude Sonnet via Bedrock, Qwen-72B via Bedrock)
independently score each response pair on a 4-criterion legal rubric.
Majority vote determines the preferred response.

Outputs JSONL with judge scores, preference, confidence, and metadata.
"""

import json
import argparse
import asyncio
import logging
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent
INPUT_PATH = DATA_DIR / "response_pairs.jsonl"
OUTPUT_PATH = DATA_DIR / "judge_annotations.jsonl"

JUDGE_PROMPT = """You are an expert legal evaluation judge. You will evaluate two legal analyses of a Ukrainian court case. The case has a known ground-truth outcome.

## Case Facts
{facts}

## Ground Truth Outcome
{label}

## Case Date
{date}

## Response A (Model: {model_a})
{response_a}

## Response B (Model: {model_b})
{response_b}

## Evaluation Criteria (score each 1-5):

1. PREDICTION CORRECTNESS (weight: 40%)
   Did the response correctly predict the court's decision?
   5 = correct prediction with nuanced confidence assessment
   3 = partially correct (e.g., predicted "partial" when answer was "approved")
   1 = completely wrong prediction

2. LEGAL REASONING (weight: 30%)
   Is the legal argumentation logically sound? Are the cited norms applicable?
   5 = flawless legal logic, correctly identifies all relevant statutes
   3 = generally sound but misses key norms or contains logical gaps
   1 = fundamentally flawed reasoning or fabricated legal norms

3. FACTUAL GROUNDING (weight: 20%)
   Does the analysis reference actual facts from the case?
   5 = every claim tied to specific case facts
   3 = some claims grounded, some generic
   1 = ignores case facts, produces generic legal boilerplate

4. TEMPORAL AWARENESS (weight: 10%)
   Does the analysis apply the correct edition of the law for the case date?
   5 = explicitly acknowledges the temporal context and cites correct law version
   3 = uses generally applicable norms without temporal specificity
   1 = cites laws not yet enacted or already repealed at the case date

You MUST output valid JSON and nothing else:
{{"response_a": {{"prediction": N, "reasoning": N, "grounding": N, "temporal": N}}, "response_b": {{"prediction": N, "reasoning": N, "grounding": N, "temporal": N}}, "preferred": "A" or "B", "confidence": "high" or "medium" or "low", "explanation": "brief justification in 1-2 sentences"}}"""

JUDGES = {
    "claude_sonnet": {
        "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
        "provider": "anthropic",
    },
    "nova_pro": {
        "model_id": "us.amazon.nova-pro-v1:0",
        "provider": "amazon",
    },
    "llama4_maverick": {
        "model_id": "us.meta.llama4-maverick-17b-instruct-v1:0",
        "provider": "meta",
    },
}


def build_judge_prompt(pair: dict) -> str:
    facts = pair["prompt"].split("Обставини справи:\n", 1)[-1]
    return JUDGE_PROMPT.format(
        facts=facts,
        label=pair["metadata"]["label"],
        date=pair["metadata"].get("adjudication_date", "unknown"),
        model_a=pair["metadata"]["model_a"],
        model_b=pair["metadata"]["model_b"],
        response_a=pair["response_a"],
        response_b=pair["response_b"],
    )


def invoke_bedrock(client, model_id: str, provider: str, prompt: str) -> dict:
    if provider == "anthropic":
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{"role": "user", "content": prompt}],
            "system": "You are an expert legal evaluation judge. Output only valid JSON.",
            "max_tokens": 512,
            "temperature": 0.1,
        }
    else:
        body = {
            "messages": [
                {"role": "system", "content": "You are an expert legal evaluation judge. Output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 512,
            "temperature": 0.1,
        }

    response = client.invoke_model(modelId=model_id, body=json.dumps(body))
    result = json.loads(response["body"].read())

    if "content" in result:
        text = result["content"][0]["text"]
    elif "choices" in result:
        text = result["choices"][0]["message"]["content"]
    elif "output" in result and "message" in result["output"]:
        text = result["output"]["message"]["content"][0]["text"]
    else:
        raise ValueError(f"Unexpected response format: {list(result.keys())}")

    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    return json.loads(text)


def compute_weighted_score(scores: dict) -> float:
    return (
        scores["prediction"] * 0.4
        + scores["reasoning"] * 0.3
        + scores["grounding"] * 0.2
        + scores["temporal"] * 0.1
    )


def aggregate_judges(judge_results: dict) -> dict:
    preferences = [r["preferred"] for r in judge_results.values() if r is not None]
    a_count = preferences.count("A")
    b_count = preferences.count("B")

    if a_count > b_count:
        majority = "A"
    elif b_count > a_count:
        majority = "B"
    else:
        majority = "tie"

    agreement = max(a_count, b_count)

    if agreement == len(preferences):
        confidence = "high"
    elif agreement > len(preferences) / 2:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "majority_preferred": majority,
        "agreement": agreement,
        "total_judges": len(preferences),
        "confidence": confidence,
    }


async def judge_pair(pair: dict, bedrock_client, semaphore: asyncio.Semaphore) -> dict | None:
    prompt = build_judge_prompt(pair)
    judge_results = {}

    for judge_name, judge_config in JUDGES.items():
        async with semaphore:
            try:
                result = await asyncio.to_thread(
                    invoke_bedrock,
                    bedrock_client,
                    judge_config["model_id"],
                    judge_config["provider"],
                    prompt,
                )
                judge_results[judge_name] = result
            except Exception as e:
                logger.error(f"Judge {judge_name} error for {pair['metadata']['doc_id']}: {e}")
                judge_results[judge_name] = None

    valid_results = {k: v for k, v in judge_results.items() if v is not None}
    if len(valid_results) < 2:
        logger.warning(f"Too few valid judges for {pair['metadata']['doc_id']}, skipping")
        return None

    aggregation = aggregate_judges(valid_results)

    score_a_per_judge = {}
    score_b_per_judge = {}
    for jname, jresult in valid_results.items():
        score_a_per_judge[jname] = compute_weighted_score(jresult["response_a"])
        score_b_per_judge[jname] = compute_weighted_score(jresult["response_b"])

    return {
        "doc_id": pair["metadata"]["doc_id"],
        "epoch": pair["metadata"]["epoch"],
        "label": pair["metadata"]["label"],
        "adjudication_date": pair["metadata"].get("adjudication_date", ""),
        "text_len": pair["metadata"]["text_len"],
        "judge_scores": judge_results,
        "score_a_weighted": sum(score_a_per_judge.values()) / len(score_a_per_judge),
        "score_b_weighted": sum(score_b_per_judge.values()) / len(score_b_per_judge),
        "aggregation": aggregation,
        "judged_at": datetime.utcnow().isoformat(),
    }


async def main_async(args):
    import boto3

    pairs = []
    with open(INPUT_PATH) as f:
        for line in f:
            pairs.append(json.loads(line))
    logger.info(f"Loaded {len(pairs)} response pairs")

    if args.limit:
        pairs = pairs[: args.limit]

    already_done = set()
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            for line in f:
                d = json.loads(line)
                already_done.add(d["doc_id"])
        logger.info(f"Resuming: {len(already_done)} already judged")
        pairs = [p for p in pairs if p["metadata"]["doc_id"] not in already_done]

    bedrock_client = boto3.client("bedrock-runtime", region_name=args.region)
    semaphore = asyncio.Semaphore(args.concurrency)

    done = 0
    errors = 0

    with open(OUTPUT_PATH, "a") as out:
        for batch_start in range(0, len(pairs), args.batch_size):
            batch = pairs[batch_start : batch_start + args.batch_size]
            tasks = [judge_pair(p, bedrock_client, semaphore) for p in batch]
            results = await asyncio.gather(*tasks)

            for r in results:
                if r is not None:
                    out.write(json.dumps(r, ensure_ascii=False) + "\n")
                    done += 1
                else:
                    errors += 1

            out.flush()
            logger.info(f"Progress: {done + len(already_done)}/{len(pairs) + len(already_done)} judged, {errors} errors")

    logger.info(f"Done: {done} new, {errors} errors")


def main():
    parser = argparse.ArgumentParser(description="Judge response pairs with multi-LLM panel")
    parser.add_argument("--region", type=str, default="us-east-1")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
