#!/usr/bin/env python3
"""
Annotate definitions via lexwebapp chat API (RAG-augmented LLM judge).

The LLM has access to MCP tools (search_legislation_text, etc.) so it can
verify whether terms are actually defined in other laws -- grounded annotation.

Usage:
  python3 annotate_via_chat.py --sample 300
  python3 annotate_via_chat.py --resume  (continue from last checkpoint)
"""

import json
import os
import random
import sys
import time
import re
import requests
from dataclasses import dataclass, asdict
from typing import Optional

API_BASE = os.getenv("API_BASE", "https://legal.org.ua")
EMAIL = "research@legal.org.ua"
PASSWORD = "DefectRadar2026!"

ANNOTATION_PROMPT = """Ти -- експерт з юридичної техніки. Проаналізуй наступну легальну дефініцію з українського законодавства на наявність двох типів дефектів:

**Закон:** {law_title} ({rada_id})
**Дефініція:** {definiendum} -- {full_definiens}

Виконай два аналізи:

## 1. Circulus in definiendo (коло у визначенні)
Чи містить definiens (права частина визначення) слова з того самого кореня, що й definiendum (ліва частина)?
Наприклад: "креативні індустрії -- види діяльності через креативне вираження" -- тут "креативний" повторюється.

Відповідь: CIRCULUS_YES або CIRCULUS_NO
Якщо YES -- вкажи яке саме слово повторюється.

## 2. Ignotum per ignotum (невідоме через невідоме)
Чи використовує definiens терміни, які самі потребують юридичного визначення, але НЕ визначені в цьому ж законі?
Для перевірки -- спробуй знайти ці терміни через пошук по законодавству.

Відповідь: IGNOTUM_YES або IGNOTUM_NO
Якщо YES -- перелічи невизначені терміни.

## Формат відповіді (суворо дотримуйся):
```json
{{
  "circulus": "YES" або "NO",
  "circulus_words": ["слово1", "слово2"] або [],
  "circulus_reasoning": "коротке пояснення",
  "ignotum": "YES" або "NO",
  "ignotum_terms": ["термін1", "термін2"] або [],
  "ignotum_reasoning": "коротке пояснення",
  "confidence": "high" або "medium" або "low"
}}
```"""


def login() -> str:
    """Login and get JWT token."""
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": EMAIL,
        "password": PASSWORD,
    })
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} {resp.text[:200]}")
        sys.exit(1)
    data = resp.json()
    token = data.get("token") or data.get("accessToken") or data.get("access_token")
    if not token:
        print(f"No token in response: {list(data.keys())}")
        sys.exit(1)
    print(f"Logged in as {EMAIL}")
    return token


def chat_query(token: str, query: str, budget: str = "standard") -> str:
    """Send a chat query and collect SSE response -- only final text chunks."""
    resp = requests.post(
        f"{API_BASE}/api/chat",
        json={"query": query, "budget": budget},
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        },
        stream=True,
        timeout=180,
    )

    if resp.status_code != 200:
        return f"ERROR: {resp.status_code} {resp.text[:200]}"

    resp.encoding = "utf-8"
    full_text = ""
    current_event = ""

    for line in resp.iter_lines(decode_unicode=True):
        if line is None:
            continue
        line = line.strip()

        if line.startswith("event: "):
            current_event = line[7:]
            continue

        if line.startswith("data: "):
            data_str = line[6:]

            # Only collect text/content from actual response events
            if current_event in ("text", "content", "answer", ""):
                try:
                    data = json.loads(data_str)
                    if isinstance(data, dict):
                        chunk = data.get("text") or data.get("content") or data.get("delta") or ""
                        if chunk:
                            full_text += chunk
                        if data.get("error"):
                            return f"ERROR: {data['error']}"
                    elif isinstance(data, str):
                        full_text += data
                except json.JSONDecodeError:
                    if data_str.strip() not in ("[DONE]", ""):
                        full_text += data_str

            if current_event == "error":
                try:
                    data = json.loads(data_str)
                    return f"ERROR: {data.get('error', data_str)}"
                except json.JSONDecodeError:
                    return f"ERROR: {data_str}"

    return full_text


def parse_annotation(response: str) -> Optional[dict]:
    """Extract structured annotation from LLM response."""
    # Try to find JSON block
    json_match = re.search(r"```json\s*(\{.*?\})\s*```", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find raw JSON
    json_match = re.search(r"\{[^{}]*\"circulus\"[^{}]*\}", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def sample_definitions(n: int = 300) -> list[dict]:
    """Stratified sample of definitions for annotation."""
    defs = [json.loads(l) for l in open("definitions.jsonl")]
    circ = {(json.loads(l)["rada_id"], json.loads(l)["definiendum"]): json.loads(l)["is_circulus"]
            for l in open("circulus_results.jsonl")}

    # Stratify: ~50% pipeline-flagged circulus, ~50% clean
    flagged = [d for d in defs if circ.get((d["rada_id"], d["definiendum"]), False)]
    clean = [d for d in defs if not circ.get((d["rada_id"], d["definiendum"]), False)]

    random.seed(42)
    n_flagged = min(n // 2, len(flagged))
    n_clean = min(n - n_flagged, len(clean))

    sample = random.sample(flagged, n_flagged) + random.sample(clean, n_clean)
    random.shuffle(sample)
    return sample


def main():
    n = 300
    for arg in sys.argv[1:]:
        if arg.startswith("--sample"):
            n = int(sys.argv[sys.argv.index(arg) + 1]) if "=" not in arg else int(arg.split("=")[1])

    checkpoint_path = "annotations_checkpoint.jsonl"
    output_path = "annotations.jsonl"

    # Load checkpoint
    done = {}
    if os.path.exists(checkpoint_path) and "--resume" in sys.argv:
        with open(checkpoint_path) as f:
            for line in f:
                r = json.loads(line)
                done[(r["rada_id"], r["definiendum"])] = r
        print(f"Resuming: {len(done)} already annotated")

    # Sample
    sample = sample_definitions(n)
    print(f"Sample: {n} definitions ({len([d for d in sample if (d['rada_id'], d['definiendum']) not in done])} remaining)")

    # Login
    token = login()

    results = list(done.values())
    errors = 0

    for i, d in enumerate(sample):
        key = (d["rada_id"], d["definiendum"])
        if key in done:
            continue

        prompt = ANNOTATION_PROMPT.format(
            law_title=d["law_title"],
            rada_id=d["rada_id"],
            definiendum=d["definiendum"],
            full_definiens=d["full_definiens"][:1500],
        )

        print(f"[{i+1}/{n}] {d['definiendum'][:50]}...", end=" ", flush=True)

        try:
            response = chat_query(token, prompt, budget="quick")
            annotation = parse_annotation(response)

            result = {
                "rada_id": d["rada_id"],
                "law_title": d["law_title"],
                "definiendum": d["definiendum"],
                "full_definiens": d["full_definiens"][:1500],
                "llm_response": response[:2000],
                "annotation": annotation,
                "pipeline_circulus": None,  # will be filled later
                "pipeline_ignotum": None,
            }

            if annotation:
                print(f"C:{annotation.get('circulus','?')} I:{annotation.get('ignotum','?')}")
            else:
                print("(parse failed)")
                errors += 1

            results.append(result)

            # Checkpoint
            with open(checkpoint_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(result, ensure_ascii=False) + "\n")

            # Rate limit
            time.sleep(1)

        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1
            time.sleep(5)

    # Save final
    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nAnnotation complete:")
    print(f"  Total: {len(results)}")
    print(f"  Errors: {errors}")
    print(f"  Output: {output_path}")

    # Quick stats
    annotated = [r for r in results if r.get("annotation")]
    if annotated:
        circ_yes = sum(1 for r in annotated if r["annotation"].get("circulus") == "YES")
        igno_yes = sum(1 for r in annotated if r["annotation"].get("ignotum") == "YES")
        print(f"  LLM says circulus: {circ_yes}/{len(annotated)} ({circ_yes/len(annotated)*100:.1f}%)")
        print(f"  LLM says ignotum: {igno_yes}/{len(annotated)} ({igno_yes/len(annotated)*100:.1f}%)")


if __name__ == "__main__":
    main()
