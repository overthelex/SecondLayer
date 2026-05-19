#!/usr/bin/env python3
"""
P0 Error Analysis experiments via lexwebapp chat.

Three experiments:
  A: Error analysis -- classify 100 circulus-flagged as TRUE_DEFECT / DOMAIN_REUSE / FALSE_POSITIVE
  B: Ignotum severity -- classify 100 ignotum-flagged terms as CRITICAL / CROSS_REF / COMMON
  C: Adversarial -- send 100 pipeline-clean definitions, check if LLM finds missed defects

Usage:
  python3 error_analysis_via_chat.py --exp A
  python3 error_analysis_via_chat.py --exp B
  python3 error_analysis_via_chat.py --exp C
  python3 error_analysis_via_chat.py --exp all
"""

import json
import os
import random
import sys
import time
import re
import requests
from typing import Optional

API_BASE = os.getenv("API_BASE", "https://legal.org.ua")
EMAIL = "research@legal.org.ua"
PASSWORD = "DefectRadar2026!"

PROMPT_A = """Ти -- експерт з юридичної техніки та нормопроєктування.

Наступне визначення було автоматично позначене як таке, що містить **circulus in definiendo** (тавтологію): кваліфікуюче слово з назви терміну повторюється в тілі визначення.

**Закон:** {law_title} ({rada_id})
**Визначення:** {definiendum} -- {full_definiens}
**Позначене слово:** повтор кореня між лівою та правою частинами

Класифікуй цей випадок:

1. **TRUE_DEFECT** -- визначення дійсно нормативно порожнє: воно не додає нового змісту до терміну, а лише перефразовує його через однокореневі слова. Правозастосувач не отримує критерію для розмежування.

2. **DOMAIN_REUSE** -- формально корінь повторюється, але визначення змістовне: воно розкриває суть терміну через родову ознаку та видову відмінність, просто доменна термінологія органічно використовує спільний корінь (наприклад, "страховий продукт" визначений через "страхову послугу" -- спільний корінь, але визначення працює).

3. **FALSE_POSITIVE** -- повтору кореня насправді немає, або повтор знаходиться в genus proximum (родовій ознаці), а не в differentia specifica.

Формат відповіді (суворо):
```json
{{
  "classification": "TRUE_DEFECT" або "DOMAIN_REUSE" або "FALSE_POSITIVE",
  "reasoning": "1-2 речення пояснення",
  "severity": "high" або "medium" або "low"
}}
```"""

PROMPT_B = """Ти -- експерт з юридичної техніки.

Наступне визначення використовує терміни, які не визначені в цьому ж законі:

**Закон:** {law_title} ({rada_id})
**Визначення:** {definiendum} -- {full_definiens}
**Невизначені терміни (за даними пайплайну):** {undefined_terms}

Для КОЖНОГО з перелічених термінів визнач тип проблеми:

1. **CRITICAL** -- термін спеціальний, без визначення норма незастосовна, термін не визначений у жодному акті законодавства
2. **CROSS_REF** -- термін визначений в іншому законі, але відсутній у цьому; потрібне явне посилання
3. **COMMON** -- термін загальновідомий, визначення формально непотрібне (наприклад, "документ", "особа")

Спробуй знайти визначення кожного терміну через пошук по законодавству.

Формат відповіді (суворо):
```json
{{
  "terms": [
    {{"term": "назва", "type": "CRITICAL" або "CROSS_REF" або "COMMON", "found_in": "назва закону або null", "reasoning": "коротко"}}
  ],
  "overall_severity": "high" або "medium" або "low"
}}
```"""

PROMPT_C = """Ти -- експерт з юридичної техніки. Проаналізуй наступну легальну дефініцію з українського законодавства на наявність двох типів дефектів:

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


def parse_json_response(response: str) -> Optional[dict]:
    json_match = re.search(r"```json\s*(\{.*?\})\s*```", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    json_match = re.search(r"\{[^{}]*\"(?:classification|terms|circulus)\"[^{}]*\}", response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass
    # Try to find JSON with nested arrays (for Exp B)
    json_match = re.search(r"\{[^}]*\"terms\"\s*:\s*\[.*?\]\s*[,}]", response, re.DOTALL)
    if json_match:
        text = json_match.group(0)
        if not text.endswith("}"):
            text = text.rstrip(",") + "}"
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    return None


def load_data():
    defs = [json.loads(l) for l in open("definitions.jsonl")]
    circ = {}
    for l in open("circulus_results.jsonl"):
        r = json.loads(l)
        circ[(r["rada_id"], r["definiendum"])] = r
    igno = {}
    for l in open("ignotum_results.jsonl"):
        r = json.loads(l)
        igno[(r["rada_id"], r["definiendum"])] = r
    return defs, circ, igno


def sample_exp_a(defs, circ, n=100):
    flagged = [d for d in defs if circ.get((d["rada_id"], d["definiendum"]), {}).get("is_circulus", False)]
    random.seed(43)
    return random.sample(flagged, min(n, len(flagged)))


def sample_exp_b(defs, igno, n=100):
    flagged = [d for d in defs if igno.get((d["rada_id"], d["definiendum"]), {}).get("undefined_terms")]
    random.seed(44)
    return random.sample(flagged, min(n, len(flagged)))


def sample_exp_c(defs, circ, igno, n=100):
    clean = [d for d in defs
             if not circ.get((d["rada_id"], d["definiendum"]), {}).get("is_circulus", False)
             and not igno.get((d["rada_id"], d["definiendum"]), {}).get("undefined_terms")]
    random.seed(45)
    return random.sample(clean, min(n, len(clean)))


def run_experiment(exp_id: str, sample: list, prompt_template: str, token: str, extra_data: dict = None):
    output_path = f"exp_{exp_id}_results.jsonl"
    checkpoint_path = f"exp_{exp_id}_checkpoint.jsonl"

    done = {}
    if os.path.exists(checkpoint_path):
        with open(checkpoint_path) as f:
            for line in f:
                r = json.loads(line)
                done[(r["rada_id"], r["definiendum"])] = r
        print(f"  Resuming: {len(done)} already done")

    results = list(done.values())
    errors = 0

    for i, d in enumerate(sample):
        key = (d["rada_id"], d["definiendum"])
        if key in done:
            continue

        fmt_args = {
            "law_title": d["law_title"],
            "rada_id": d["rada_id"],
            "definiendum": d["definiendum"],
            "full_definiens": d["full_definiens"][:1500],
        }
        if extra_data and key in extra_data:
            fmt_args.update(extra_data[key])

        prompt = prompt_template.format(**fmt_args)

        print(f"  [{i+1}/{len(sample)}] {d['definiendum'][:45]}...", end=" ", flush=True)

        try:
            response = chat_query(token, prompt, budget="quick")
            annotation = parse_json_response(response)

            result = {
                "rada_id": d["rada_id"],
                "definiendum": d["definiendum"],
                "law_title": d["law_title"],
                "full_definiens": d["full_definiens"][:1500],
                "llm_response": response[:3000],
                "annotation": annotation,
            }

            if annotation:
                cls = annotation.get("classification") or annotation.get("circulus") or "?"
                print(f"{cls}")
            else:
                print("(parse failed)")
                errors += 1

            results.append(result)

            with open(checkpoint_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(result, ensure_ascii=False) + "\n")

            time.sleep(1)

        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1
            time.sleep(5)

    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"  Done: {len(results)} results, {errors} errors -> {output_path}")
    return results


def report_a(results):
    valid = [r for r in results if r.get("annotation", {}).get("classification")]
    from collections import Counter
    counts = Counter(r["annotation"]["classification"] for r in valid)
    total = len(valid)
    print(f"\n=== Exp A: Circulus Error Analysis ({total} valid) ===")
    for cls in ["TRUE_DEFECT", "DOMAIN_REUSE", "FALSE_POSITIVE"]:
        c = counts.get(cls, 0)
        print(f"  {cls}: {c}/{total} ({c/total*100:.1f}%)")
    td = counts.get("TRUE_DEFECT", 0)
    print(f"  Real precision: {td}/{total} = {td/total*100:.1f}%")


def report_b(results):
    valid = [r for r in results if r.get("annotation", {}).get("terms")]
    all_terms = []
    for r in valid:
        for t in r["annotation"]["terms"]:
            all_terms.append(t.get("type", "?"))
    from collections import Counter
    counts = Counter(all_terms)
    total = len(all_terms)
    print(f"\n=== Exp B: Ignotum Severity ({len(valid)} definitions, {total} terms) ===")
    for tp in ["CRITICAL", "CROSS_REF", "COMMON"]:
        c = counts.get(tp, 0)
        print(f"  {tp}: {c}/{total} ({c/total*100:.1f}%)")


def report_c(results):
    valid = [r for r in results if r.get("annotation")]
    circ_found = sum(1 for r in valid if r["annotation"].get("circulus") == "YES")
    igno_found = sum(1 for r in valid if r["annotation"].get("ignotum") == "YES")
    total = len(valid)
    print(f"\n=== Exp C: Adversarial -- pipeline-clean definitions ({total} valid) ===")
    print(f"  LLM found circulus: {circ_found}/{total} ({circ_found/total*100:.1f}%)")
    print(f"  LLM found ignotum: {igno_found}/{total} ({igno_found/total*100:.1f}%)")
    print(f"  Pipeline FN rate (circulus): {circ_found/total*100:.1f}%")
    print(f"  Pipeline FN rate (ignotum): {igno_found/total*100:.1f}%")


def main():
    experiments = set()
    for arg in sys.argv[1:]:
        if arg.startswith("--exp"):
            val = sys.argv[sys.argv.index(arg) + 1] if "=" not in arg else arg.split("=")[1]
            if val.lower() == "all":
                experiments = {"A", "B", "C"}
            else:
                experiments.add(val.upper())

    if not experiments:
        print("Usage: python3 error_analysis_via_chat.py --exp A|B|C|all")
        sys.exit(1)

    defs, circ, igno = load_data()
    token = login()

    if "A" in experiments:
        print("\n--- Experiment A: Circulus Error Analysis (100 flagged) ---")
        sample = sample_exp_a(defs, circ)
        results = run_experiment("A", sample, PROMPT_A, token)
        report_a(results)

    if "B" in experiments:
        print("\n--- Experiment B: Ignotum Severity Tiers (100 flagged) ---")
        sample = sample_exp_b(defs, igno)
        extra = {}
        for d in sample:
            key = (d["rada_id"], d["definiendum"])
            terms = igno.get(key, {}).get("undefined_terms", [])
            extra[key] = {"undefined_terms": ", ".join(terms[:10])}
        results = run_experiment("B", sample, PROMPT_B, token, extra)
        report_b(results)

    if "C" in experiments:
        print("\n--- Experiment C: Adversarial -- pipeline-clean (100) ---")
        sample = sample_exp_c(defs, circ, igno)
        results = run_experiment("C", sample, PROMPT_C, token)
        report_c(results)


if __name__ == "__main__":
    main()
