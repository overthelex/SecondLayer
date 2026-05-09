"""Phase 1: Data audit for Experiment 1 Phase B crowd annotation."""

import json
import re
import csv
from pathlib import Path
from collections import Counter

import tiktoken
from langdetect import detect, DetectorFactory

DetectorFactory.seed = 42
enc = tiktoken.get_encoding("cl100k_base")

BASE = Path(__file__).resolve().parent.parent
PLATFORM_PATH = BASE / "output" / "experiment1" / "crowd-platform.jsonl"
FULL_PATH = BASE / "output" / "experiment1" / "crowd-samples.jsonl"
OUTPUT_DIR = BASE / "output" / "experiment1"

platform = [json.loads(l) for l in PLATFORM_PATH.read_text().splitlines()]
full = [json.loads(l) for l in FULL_PATH.read_text().splitlines()]
full_lookup = {s["sample_id"]: s for s in full}

CODE_INDICATORS = [
    "def ", "function ", "class ", "import ", "const ", "let ", "var ",
    "=>", "return ", "if (", "for (", "SELECT ", "FROM ", "WHERE ",
    "INSERT ", "async ", "await ", "export ", "interface ", "type ",
]

STRUCTURED_INDICATORS = ["```", "| ---", "## ", "- [", "---\n"]


def classify_content(text: str) -> str:
    code_score = sum(1 for ind in CODE_INDICATORS if ind in text)
    has_braces = text.count("{") + text.count("}") > 4

    if code_score >= 5 or has_braces:
        return "pure_code"
    elif code_score >= 2:
        return "code_with_comments"
    elif any(x in text for x in STRUCTURED_INDICATORS):
        return "structured"
    elif code_score >= 1:
        return "mixed_prose_code"
    else:
        return "prose"


def main():
    results = []
    for p in platform:
        sid = p["sample_id"]
        text = p["llm_output"]
        meta = full_lookup[sid]["metadata"] if sid in full_lookup else {}

        try:
            lang = detect(text) if len(text.strip()) > 20 else "unknown"
        except Exception:
            lang = "unknown"

        tokens = len(enc.encode(text))
        chars = len(text)
        content_type = classify_content(text)

        results.append({
            "sample_id": sid,
            "language": lang,
            "tokens": tokens,
            "chars": chars,
            "content_type": content_type,
            "edit_class": meta.get("edit_class", ""),
            "session_source": meta.get("session_source", ""),
            "edit_distance_norm": meta.get("edit_distance_norm", ""),
        })

    # === REPORTS ===
    print("=== LANGUAGE DISTRIBUTION ===")
    lang_counts = Counter(r["language"] for r in results)
    for lang, cnt in lang_counts.most_common(10):
        print(f"  {lang}: {cnt} ({100*cnt/len(results):.1f}%)")

    en_pure = sum(1 for r in results if r["language"] == "en")
    non_en = [r for r in results if r["language"] != "en"]
    print(f"\n  Pure English (en): {en_pure} ({100*en_pure/len(results):.1f}%)")
    print(f"  Non-English: {len(non_en)} ({100*len(non_en)/len(results):.1f}%)")

    print("\n=== TOKEN DISTRIBUTION ===")
    tokens_list = sorted([r["tokens"] for r in results])
    n = len(tokens_list)
    print(f"  P10={tokens_list[n//10]}, P25={tokens_list[n//4]}, P50={tokens_list[n//2]}, "
          f"P75={tokens_list[3*n//4]}, P90={tokens_list[9*n//10]}, max={tokens_list[-1]}")
    over_4k = sum(1 for r in results if r["tokens"] > 4000)
    over_2k = sum(1 for r in results if r["tokens"] > 2000)
    over_1k = sum(1 for r in results if r["tokens"] > 1000)
    print(f"  >4000 tokens: {over_4k}")
    print(f"  >2000 tokens: {over_2k}")
    print(f"  >1000 tokens: {over_1k}")

    print("\n=== CONTENT TYPE ===")
    ct_counts = Counter(r["content_type"] for r in results)
    for ct, cnt in ct_counts.most_common():
        print(f"  {ct}: {cnt} ({100*cnt/len(results):.1f}%)")

    print("\n=== STRATIFICATION VERIFICATION ===")
    strat_counts = Counter(r["edit_class"] for r in results)
    expected = {
        "substantive_rewrite": 144,
        "cosmetic": 15,
        "reorganization": 11,
        "rejection": 10,
        "factual_correction": 10,
        "tone_adjustment": 10,
    }
    all_match = True
    for cls, exp in expected.items():
        actual = strat_counts.get(cls, 0)
        match = "OK" if actual == exp else "MISMATCH"
        if actual != exp:
            all_match = False
        print(f"  {cls}: expected={exp}, actual={actual} [{match}]")
    print(f"  All match: {all_match}")

    # Non-English detail
    print("\n=== NON-ENGLISH SAMPLES ===")
    for r in non_en:
        s = full_lookup[r["sample_id"]]
        preview = s["llm_output"][:150].replace("\n", " ")
        print(f"  [{r['language']}] {r['sample_id'][:8]}... tokens={r['tokens']} | {preview}")

    # Save CSV
    csv_path = OUTPUT_DIR / "phase_b_audit.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
    print(f"\nSaved: {csv_path}")

    # === GENERATE AUDIT REPORT ===
    report = f"""# Phase B Audit Report

## 1. Language Distribution

| Language | Count | % |
|----------|-------|---|
"""
    for lang, cnt in lang_counts.most_common(10):
        report += f"| {lang} | {cnt} | {100*cnt/len(results):.1f}% |\n"

    report += f"""
**Summary:** {en_pure} samples ({100*en_pure/len(results):.1f}%) are pure English.
{len(non_en)} samples detected as non-English (may be code-heavy triggering false detection).

**Decision:** {"Translation NOT required (>=95% English)." if en_pure >= 190 else "Translation triage required for non-English samples."}

## 2. Token Length Distribution

| Metric | Value |
|--------|-------|
| P10 | {tokens_list[n//10]} |
| P25 | {tokens_list[n//4]} |
| P50 (median) | {tokens_list[n//2]} |
| P75 | {tokens_list[3*n//4]} |
| P90 | {tokens_list[9*n//10]} |
| Max | {tokens_list[-1]} |
| >1000 tokens | {over_1k} samples |
| >2000 tokens | {over_2k} samples |
| >4000 tokens | {over_4k} samples |

{"**Flag:** " + str(over_4k) + " samples exceed 4000 tokens — may need truncation or special handling for crowd workflow." if over_4k > 0 else "No samples exceed 4000 tokens. All within acceptable range for crowd annotation."}

## 3. Stratification Verification

| Class | Expected | Actual | Status |
|-------|----------|--------|--------|
"""
    for cls, exp in expected.items():
        actual = strat_counts.get(cls, 0)
        status = "OK" if actual == exp else "MISMATCH"
        report += f"| {cls} | {exp} | {actual} | {status} |\n"

    report += f"""
**Result:** {"All strata match documented allocation." if all_match else "MISMATCH detected — investigate."}

## 4. Content Type Breakdown

| Type | Count | % |
|------|-------|---|
"""
    for ct, cnt in ct_counts.most_common():
        report += f"| {ct} | {cnt} | {100*cnt/len(results):.1f}% |\n"

    report += """
## 5. Samples Flagged for Review

"""
    if over_4k > 0:
        report += f"**Long samples (>4000 tokens):** {over_4k} — review for truncation.\n\n"

    if non_en:
        report += f"**Non-English detected ({len(non_en)} samples):**\n\n"
        for r in non_en:
            preview = full_lookup[r["sample_id"]]["llm_output"][:100].replace("\n", " ")
            report += f"- `{r['sample_id'][:8]}...` [{r['language']}] {r['tokens']}tok: {preview}\n"
    else:
        report += "No samples flagged.\n"

    report += """
## 6. Decision Log

- **Translation:** [pending Phase 1 review]
- **PII scan:** [pending Phase 2]
- **Long sample handling:** [pending review]
"""

    audit_path = OUTPUT_DIR / "phase_b_audit.md"
    audit_path.write_text(report)
    print(f"Saved: {audit_path}")


if __name__ == "__main__":
    main()
