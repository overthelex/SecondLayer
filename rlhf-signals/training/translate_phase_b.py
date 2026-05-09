"""
Translate non-English samples for Experiment 1 Phase B via AWS Bedrock (Claude Sonnet).
Also applies PII redaction for high-severity findings.

Usage:
  cd rlhf-signals
  python3 training/translate_phase_b.py
"""

import json
import time
import re
from pathlib import Path
from datetime import datetime, timezone

import boto3

BASE = Path(__file__).resolve().parent.parent
MANIFEST_PATH = BASE / "output" / "experiment1" / "phase_b" / "translation_manifest.json"
PII_PATH = BASE / "output" / "experiment1" / "phase_b" / "pii_findings.md"
FULL_SAMPLES_PATH = BASE / "output" / "experiment1" / "crowd-samples.jsonl"
OUTPUT_PATH = BASE / "output" / "experiment1" / "phase_b" / "translated_samples.json"

MODEL_ID = "eu.anthropic.claude-sonnet-4-6"
REGION = "eu-central-1"

TRANSLATION_PROMPT = """Translate the following text to English. Rules:
- Preserve ALL code fragments, variable names, function names, file paths, URLs, and technical identifiers exactly as they appear
- Preserve markdown formatting (bold, code blocks, lists, tables)
- For domain-specific legal terms, provide the English translation with the original term in parentheses on first occurrence
- Output ONLY the translated text with no preamble, explanation, or surrounding quotes"""

# High-severity PII redactions (from pii_findings.md review)
PII_REDACTIONS = {
    "Tanisha Minev": "[REDACTED:NAME]",
    "Cristiana Melill": "[REDACTED:NAME]",
    "Kadelbach": "[REDACTED:NAME]",
    "Breidenbach": "[REDACTED:NAME]",
    "Овчаров Володимир Валентинович": "[REDACTED:NAME]",
    "Овчаров": "[REDACTED:NAME]",
    "Володимир": "[REDACTED:NAME]",
    "ovcharov": "[REDACTED:NAME]",
    "Ovcharov": "[REDACTED:NAME]",
    "vladimir": "[REDACTED:NAME]",
    "Vladimir": "[REDACTED:NAME]",
    "Кириченко Ігор Вікторович": "[REDACTED:NAME]",
    "mail.merged.com.ua": "[REDACTED:HOSTNAME]",
    "plane.legal.org.ua": "[REDACTED:HOSTNAME]",
    "http://127.0.0.1:3000/": "[REDACTED:URL]",
}


def apply_redactions(text: str) -> str:
    for pattern, replacement in PII_REDACTIONS.items():
        text = text.replace(pattern, replacement)
    return text


def translate_text(client, text: str) -> str:
    if not text or len(text.strip()) < 5:
        return text

    response = client.converse(
        modelId=MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [{"text": f"{TRANSLATION_PROMPT}\n\n---\n\n{text}"}],
            }
        ],
        inferenceConfig={"maxTokens": 4096, "temperature": 0.0},
    )

    return response["output"]["message"]["content"][0]["text"]


def main():
    manifest = json.loads(MANIFEST_PATH.read_text())
    full_samples = {
        s["sample_id"]: s
        for s in (json.loads(l) for l in FULL_SAMPLES_PATH.read_text().splitlines())
    }

    client = boto3.client("bedrock-runtime", region_name=REGION)

    results = []
    total_calls = 0
    errors = []

    print(f"Processing {len(manifest)} samples...")
    print(f"Model: {MODEL_ID} ({REGION})")
    print()

    for i, item in enumerate(manifest):
        sid = item["sample_id"]
        sample = full_samples.get(sid, {})
        llm_original = item["llm_output_original"]
        edit_original = item.get("founder_edit_original", sample.get("founder_edit", ""))

        # Apply PII redaction first
        llm_redacted = apply_redactions(llm_original)
        edit_redacted = apply_redactions(edit_original)

        result = {
            "sample_id": sid,
            "detected_language": item["detected_language"],
            "llm_output_original": llm_original,
            "llm_output_redacted": llm_redacted,
            "llm_output_translated": None,
            "founder_edit_original": edit_original,
            "founder_edit_redacted": edit_redacted,
            "founder_edit_translated": None,
            "translation_model": MODEL_ID,
            "translated_at": None,
        }

        # Translate llm_output
        needs_llm = item["llm_output_translation"] in ("needs_external_translation", "mostly_technical")
        needs_edit = item["founder_edit_translation"] in ("needs_external_translation", "mostly_technical")

        try:
            if needs_llm:
                print(f"  [{i+1}/{len(manifest)}] {sid[:8]}... translating llm_output ({len(llm_redacted)} chars)...", end="", flush=True)
                result["llm_output_translated"] = translate_text(client, llm_redacted)
                total_calls += 1
                print(" done")
                time.sleep(0.3)
            else:
                result["llm_output_translated"] = llm_redacted

            if needs_edit and edit_redacted:
                print(f"  [{i+1}/{len(manifest)}] {sid[:8]}... translating founder_edit ({len(edit_redacted)} chars)...", end="", flush=True)
                result["founder_edit_translated"] = translate_text(client, edit_redacted)
                total_calls += 1
                print(" done")
                time.sleep(0.3)
            else:
                result["founder_edit_translated"] = edit_redacted

            result["translated_at"] = datetime.now(timezone.utc).isoformat()

        except Exception as e:
            error_msg = f"Error on {sid}: {e}"
            print(f" ERROR: {e}")
            errors.append(error_msg)
            result["llm_output_translated"] = result["llm_output_translated"] or llm_redacted
            result["founder_edit_translated"] = result["founder_edit_translated"] or edit_redacted

        results.append(result)

    # Save results
    OUTPUT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\n{'='*60}")
    print(f"Done. {total_calls} API calls, {len(errors)} errors.")
    print(f"Saved: {OUTPUT_PATH}")

    if errors:
        print(f"\nErrors:")
        for e in errors:
            print(f"  {e}")

    # Stats
    translated_llm = sum(1 for r in results if r["llm_output_translated"] != r["llm_output_redacted"])
    translated_edit = sum(1 for r in results if r["founder_edit_translated"] != r["founder_edit_redacted"])
    print(f"\nTranslated: {translated_llm} llm_outputs, {translated_edit} founder_edits")


if __name__ == "__main__":
    main()
