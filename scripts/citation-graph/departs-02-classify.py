#!/usr/bin/env python3
# =====================================================================
# departs-02-classify.py   (runs ON prod HOST — boto3 1.43.x present there;
# Bedrock IAM keys live in ~/SecondLayer/deployment/.env.prod, region
# eu-central-1). DEPARTS_FROM layer, step 2: LLM-classify GC "відступ"
# windows produced by brev-departs-01-extract-windows.py.
#
# For each window, Claude Haiku 4.5 decides whether the Grand Chamber
# FORMALLY departed (відступити від правового висновку) from a prior
# position, and which case number it departed from. Real departures with
# a case number are written to CSV for the Neo4j DEPARTS_FROM load.
#
#   set -a; eval "$(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION|BEDROCK_MODEL_QUICK)=' ~/SecondLayer/deployment/.env.prod)"; set +a
#   python3 departs-02-classify.py < gc_departs_windows.jsonl > gc_departs_edges.csv
# =====================================================================
import os, sys, json, csv, re
from concurrent.futures import ThreadPoolExecutor
import boto3

MODEL = os.environ.get("BEDROCK_MODEL_QUICK", "eu.anthropic.claude-haiku-4-5-20251001-v1:0")
REGION = os.environ.get("AWS_REGION", "eu-central-1")
WORKERS = 6
CASE_RE = re.compile(r"\d+/\d+/\d+(?:-[а-яіїєґA-Za-z0-9]+)?")

bedrock = boto3.client("bedrock-runtime", region_name=REGION)

PROMPT = """Ти аналізуєш уривок з постанови Великої Палати Верховного Суду України.
Питання: чи Велика Палата у цьому уривку ФОРМАЛЬНО ВІДСТУПАЄ від раніше висловленого правового висновку (відступає від правової позиції) в іншій справі?

Це НЕ відступ, якщо суд: не вбачає підстав для відступу, відмовляє у відступі, лише згадує/цитує відступ в іншому контексті, або посилається на висновок без відступу від нього.

Поверни СТРОГО JSON без пояснень:
{"is_departure": true|false, "departed_case": "номер справи від якої відступають, напр. 826/3858/18, або null"}

Уривок:
---
%s
---"""


def classify(rec):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 120,
        "messages": [{"role": "user", "content": PROMPT % rec["window"][:1600]}],
    }
    try:
        resp = bedrock.invoke_model(modelId=MODEL, body=json.dumps(body))
        payload = json.loads(resp["body"].read())
        txt = payload["content"][0]["text"]
        j = json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
    except Exception as e:
        sys.stderr.write(f"err doc {rec['doc_id']}: {e}\n")
        return None
    if not j.get("is_departure"):
        return None
    dep = j.get("departed_case") or rec.get("candidate_case")
    if not dep or not CASE_RE.fullmatch(str(dep).strip()):
        return None
    return {"doc_id": rec["doc_id"], "departed_case": str(dep).strip(),
            "departed_on": rec.get("adj_date")}


def main():
    recs = [json.loads(l) for l in sys.stdin if l.strip()]
    sys.stderr.write(f"windows: {len(recs)}\n")
    out = csv.writer(sys.stdout)
    out.writerow(["doc_id", "departed_case", "departed_on"])
    seen, n = set(), 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for r in ex.map(classify, recs):
            if not r:
                continue
            key = (r["doc_id"], r["departed_case"])
            if key in seen:
                continue
            seen.add(key)
            out.writerow([r["doc_id"], r["departed_case"], r["departed_on"] or ""])
            n += 1
    sys.stderr.write(f"real departures: {n}\n")


if __name__ == "__main__":
    main()
