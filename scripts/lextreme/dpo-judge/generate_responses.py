#!/usr/bin/env python3
"""
Generate response pairs for judge-guided DPO experiment.

For each sampled EDRSR case, generates two legal analyses:
  - Model A: CPT Qwen 2.5 (domain-adapted)
  - Model B: GPT-4o-mini (general-purpose baseline)

Uses AWS Bedrock for GPT-4o-mini and a local/remote endpoint for CPT Qwen.
Outputs JSONL with prompt, response_a, response_b, and metadata.
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
INPUT_PATH = DATA_DIR / "sampled_cases.jsonl"
OUTPUT_PATH = DATA_DIR / "response_pairs.jsonl"

PROMPT_TEMPLATE = """Ви -- досвідчений юрист-аналітик. Проаналізуйте наведені обставини справи та надайте юридичний висновок.

Завдання:
1. Визначте застосовні правові норми (конкретні статті кодексів та законів).
2. Оцініть, чи підтверджуються позовні вимоги встановленими фактами.
3. Спрогнозуйте рішення суду: задоволено / відмовлено / частково задоволено.
4. Обґрунтуйте свій висновок з посиланням на норми та факти справи.

Обставини справи:
{facts}"""

SYSTEM_PROMPT = "Ви -- досвідчений юрист-аналітик з глибоким знанням українського законодавства."


def build_prompt(case: dict) -> str:
    return PROMPT_TEMPLATE.format(facts=case["text"])


async def generate_bedrock(client, prompt: str, model_id: str, temperature: float = 0.3) -> str:
    """Generate response via AWS Bedrock."""
    import boto3

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "system": SYSTEM_PROMPT,
        "max_tokens": 1024,
        "temperature": temperature,
    }

    if "gpt" in model_id or "openai" in model_id:
        body = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1024,
            "temperature": temperature,
        }

    response = client.invoke_model(
        modelId=model_id,
        body=json.dumps(body),
    )
    result = json.loads(response["body"].read())

    if "content" in result:
        return result["content"][0]["text"]
    elif "choices" in result:
        return result["choices"][0]["message"]["content"]
    else:
        raise ValueError(f"Unexpected response format: {list(result.keys())}")


async def generate_local(session, prompt: str, endpoint: str, temperature: float = 0.3) -> str:
    """Generate response via local/remote vLLM or compatible endpoint."""
    import aiohttp

    payload = {
        "model": "cpt-qwen",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 1024,
        "temperature": temperature,
    }

    async with session.post(f"{endpoint}/v1/chat/completions", json=payload) as resp:
        result = await resp.json()
        return result["choices"][0]["message"]["content"]


async def process_case(
    case: dict,
    bedrock_client,
    session,
    cpt_endpoint: str,
    bedrock_model: str,
    semaphore: asyncio.Semaphore,
) -> dict | None:
    prompt = build_prompt(case)

    async with semaphore:
        try:
            response_b = await asyncio.to_thread(
                generate_bedrock, bedrock_client, prompt, bedrock_model
            )
        except Exception as e:
            logger.error(f"Bedrock error for {case.get('doc_id', '?')}: {e}")
            return None

        try:
            response_a = await generate_local(session, prompt, cpt_endpoint)
        except Exception as e:
            logger.error(f"CPT endpoint error for {case.get('doc_id', '?')}: {e}")
            return None

    return {
        "prompt": prompt,
        "response_a": response_a,
        "response_b": response_b,
        "metadata": {
            "doc_id": case.get("doc_id", ""),
            "epoch": case["epoch"],
            "label": case["label"],
            "adjudication_date": case.get("adjudication_date", ""),
            "text_len": case["text_len"],
            "model_a": "cpt-qwen-2.5",
            "model_b": bedrock_model,
            "generated_at": datetime.utcnow().isoformat(),
        },
    }


async def main_async(args):
    import aiohttp
    import boto3

    cases = []
    with open(INPUT_PATH) as f:
        for line in f:
            cases.append(json.loads(line))
    logger.info(f"Loaded {len(cases)} cases")

    if args.limit:
        cases = cases[: args.limit]
        logger.info(f"Limited to {len(cases)} cases")

    already_done = set()
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            for line in f:
                d = json.loads(line)
                already_done.add(d["metadata"]["doc_id"])
        logger.info(f"Resuming: {len(already_done)} already done")
        cases = [c for c in cases if c.get("doc_id", "") not in already_done]
        logger.info(f"Remaining: {len(cases)} cases")

    bedrock_client = boto3.client("bedrock-runtime", region_name=args.region)
    semaphore = asyncio.Semaphore(args.concurrency)

    done = 0
    errors = 0

    async with aiohttp.ClientSession() as session:
        with open(OUTPUT_PATH, "a") as out:
            for batch_start in range(0, len(cases), args.batch_size):
                batch = cases[batch_start : batch_start + args.batch_size]
                tasks = [
                    process_case(c, bedrock_client, session, args.cpt_endpoint, args.bedrock_model, semaphore)
                    for c in batch
                ]
                results = await asyncio.gather(*tasks)

                for r in results:
                    if r is not None:
                        out.write(json.dumps(r, ensure_ascii=False) + "\n")
                        done += 1
                    else:
                        errors += 1

                out.flush()
                logger.info(f"Progress: {done + len(already_done)}/{len(cases) + len(already_done)} done, {errors} errors")

    logger.info(f"Finished: {done} new, {errors} errors, {len(already_done)} resumed")


def main():
    parser = argparse.ArgumentParser(description="Generate response pairs for DPO judge experiment")
    parser.add_argument("--cpt-endpoint", type=str, default="http://localhost:8000",
                        help="CPT Qwen vLLM endpoint URL")
    parser.add_argument("--bedrock-model", type=str, default="us.amazon.nova-pro-v1:0",
                        help="Bedrock model ID for Model B")
    parser.add_argument("--region", type=str, default="us-east-1")
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--limit", type=int, default=None, help="Limit number of cases (for testing)")
    args = parser.parse_args()

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
