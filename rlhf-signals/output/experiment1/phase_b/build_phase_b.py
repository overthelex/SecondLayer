#!/usr/bin/env python3
"""
Phase B builder for Experiment 1 crowd annotation.
Handles: PII scan (Phase 2), Translation pipeline (Phase 3),
Attention checks (Phase 6), Batch building (Phase 7), Pilot batch (Phase 8).
"""

import json
import re
import hashlib
import random
from pathlib import Path
from collections import Counter, defaultdict

# Paths
BASE_DIR = Path(__file__).parent.parent
CROWD_SAMPLES = BASE_DIR / "crowd-samples.jsonl"
OUTPUT_DIR = Path(__file__).parent

# ============================================================
# Phase 2: PII Scan
# ============================================================

PII_PATTERNS = {
    "email": {
        "pattern": re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'),
        "severity": "high",
    },
    "phone_intl": {
        "pattern": re.compile(r'\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}'),
        "severity": "medium",
    },
    "internal_url": {
        "pattern": re.compile(r'https?://[a-zA-Z0-9.-]*(?:legal\.org\.ua|lex\.[a-z]+|localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)[^\s"\']*'),
        "severity": "high",
    },
    "internal_hostname": {
        "pattern": re.compile(r'\b(?:local\.legal\.org\.ua|prod\.legal\.org\.ua|mail\.merged\.com\.ua|plane\.legal\.org\.ua)\b'),
        "severity": "high",
    },
    "aws_key": {
        "pattern": re.compile(r'(?:AKIA|ASIA)[A-Z0-9]{16}'),
        "severity": "high",
    },
    "jwt_token": {
        "pattern": re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
        "severity": "high",
    },
    "high_entropy_token": {
        "pattern": re.compile(r'(?:token|key|secret|password|api_key|apikey)\s*[=:]\s*["\']?([A-Za-z0-9+/=_-]{20,})["\']?', re.IGNORECASE),
        "severity": "high",
    },
    "edrpou": {
        "pattern": re.compile(r'\b\d{8}\b'),
        "severity": "low",  # too many false positives, only flag in context
    },
    "rnokpp": {
        "pattern": re.compile(r'\b\d{10}\b'),
        "severity": "medium",
    },
    "project_names": {
        "pattern": re.compile(r'\b(?:SecondLayer|SneakyPiper|aipromo|Calendary|Panoptic|XSISTANT|Fondy|ZakonOnline|legal\.org\.ua)\b', re.IGNORECASE),
        "severity": "medium",
    },
    "company_names": {
        "pattern": re.compile(r'\b(?:Brooke|Deloitte|NVIDIA|Google for Startups)\b'),
        "severity": "low",
    },
    "person_names": {
        "pattern": re.compile(r'\b(?:Ovcharov|Овчаров|Kadelbach|Breidenbach|Tanisha\s+Minev|Cristiana\s+Melill|Vladimir|Володимир)\b', re.IGNORECASE),
        "severity": "high",
    },
}

# EDRPOU context: only flag 8-digit numbers if they appear near identifying context
EDRPOU_CONTEXT = re.compile(r'(?:ЄДРПОУ|EDRPOU|код|ідентифікаційний|реєстр)', re.IGNORECASE)


def scan_pii(text, sample_id, field_name):
    """Scan a text field for PII patterns. Returns list of findings."""
    findings = []
    for pii_type, config in PII_PATTERNS.items():
        matches = config["pattern"].finditer(text)
        for m in matches:
            matched_text = m.group(0)

            # EDRPOU filter: only flag if context suggests it's actually an entity code
            if pii_type == "edrpou":
                # Check surrounding context (50 chars each side)
                start = max(0, m.start() - 50)
                end = min(len(text), m.end() + 50)
                context = text[start:end]
                if not EDRPOU_CONTEXT.search(context):
                    continue

            # Phone: skip if it's just a port number or similar technical value
            if pii_type == "phone_intl":
                if len(matched_text.replace(" ", "").replace("-", "").replace(".", "")) < 7:
                    continue
                # Skip if surrounded by technical context (ports, versions)
                start = max(0, m.start() - 10)
                context_before = text[start:m.start()]
                if re.search(r'(?:port|version|v\d|\.\d)', context_before, re.IGNORECASE):
                    continue

            severity = config["severity"]
            action = "redact" if severity == "high" else "flag" if severity == "medium" else "ok"

            findings.append({
                "sample_id": sample_id,
                "field": field_name,
                "match_type": pii_type,
                "matched_text": matched_text[:30] + ("..." if len(matched_text) > 30 else ""),
                "severity": severity,
                "suggested_action": action,
            })
    return findings


def run_pii_scan(samples):
    """Run PII scan across all samples."""
    all_findings = []
    for s in samples:
        all_findings.extend(scan_pii(s["llm_output"], s["sample_id"], "llm_output"))
        all_findings.extend(scan_pii(s["founder_edit"], s["sample_id"], "founder_edit"))
    return all_findings


def write_pii_report(findings, output_path):
    """Write PII findings to markdown report."""
    with open(output_path, "w") as f:
        f.write("# PII Scan Findings\n\n")
        f.write(f"**Total findings:** {len(findings)}\n\n")

        # Summary by severity
        by_severity = Counter(x["severity"] for x in findings)
        f.write("## Summary by Severity\n\n")
        f.write("| Severity | Count |\n|----------|-------|\n")
        for sev in ["high", "medium", "low"]:
            f.write(f"| {sev} | {by_severity.get(sev, 0)} |\n")
        f.write("\n")

        # Summary by type
        by_type = Counter(x["match_type"] for x in findings)
        f.write("## Summary by Type\n\n")
        f.write("| Type | Count |\n|------|-------|\n")
        for t, c in by_type.most_common():
            f.write(f"| {t} | {c} |\n")
        f.write("\n")

        # Detail table
        f.write("## Detailed Findings\n\n")
        f.write("| sample_id | field | match_type | matched_text | severity | action |\n")
        f.write("|-----------|-------|------------|--------------|----------|--------|\n")
        for finding in sorted(findings, key=lambda x: ({"high": 0, "medium": 1, "low": 2}[x["severity"]], x["sample_id"])):
            sid = finding["sample_id"][:12] + "..."
            text_escaped = finding["matched_text"].replace("|", "\\|").replace("\n", " ")
            f.write(f"| {sid} | {finding['field']} | {finding['match_type']} | `{text_escaped}` | {finding['severity']} | {finding['suggested_action']} |\n")

        f.write("\n## Recommendations\n\n")
        high_count = by_severity.get("high", 0)
        if high_count > 0:
            f.write(f"- **{high_count} high-severity findings** require redaction before crowd deployment.\n")
            f.write("- Review each high-severity match manually to confirm it's genuine PII (not a false positive).\n")
        else:
            f.write("- No high-severity PII detected.\n")
        f.write("- Medium-severity items should be reviewed but may be acceptable in context.\n")
        f.write("- Low-severity items are informational only.\n")


# ============================================================
# Phase 3: Translation Pipeline
# ============================================================

# Language detection results from phase_b_audit
NON_ENGLISH_LANGS = {"ru", "uk", "et", "bg", "nl", "no", "fr", "unknown"}


def classify_translation_need(text, detected_lang):
    """
    Classify whether a sample needs external translation.
    Returns: 'no_translation' | 'needs_external_translation' | 'mostly_technical'
    """
    if detected_lang == "en":
        return "no_translation"

    # Count proportion of ASCII/code vs non-ASCII prose
    lines = text.split("\n")
    code_lines = 0
    prose_lines = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Heuristics for code: starts with common code patterns
        if re.match(r'^[\s]*(?:[{}\[\]()`;]|//|/\*|\*|#!|import |export |const |let |var |function |class |def |return |if |else |for |while )', stripped):
            code_lines += 1
        elif re.match(r'^[\s]*[-*]\s', stripped):  # markdown lists
            prose_lines += 1
        elif any(ord(c) > 127 for c in stripped):
            prose_lines += 1
        else:
            code_lines += 1

    total = code_lines + prose_lines
    if total == 0:
        return "needs_external_translation"

    code_ratio = code_lines / total
    if code_ratio > 0.7:
        return "mostly_technical"
    else:
        return "needs_external_translation"


def build_translation_manifest(samples, lang_map):
    """Build translation manifest for non-English samples."""
    manifest = []
    for s in samples:
        sid = s["sample_id"]
        lang = lang_map.get(sid, "en")
        if lang == "en":
            continue

        llm_need = classify_translation_need(s["llm_output"], lang)
        edit_need = classify_translation_need(s["founder_edit"], lang)

        manifest.append({
            "sample_id": sid,
            "detected_language": lang,
            "llm_output_translation": llm_need,
            "founder_edit_translation": edit_need,
            "llm_output_original": s["llm_output"],
            "founder_edit_original": s["founder_edit"],
        })
    return manifest


# ============================================================
# Phase 6: Attention Checks
# ============================================================

ATTENTION_CHECKS = [
    {
        "sample_id": "attn_check_001_embedded_instruction",
        "input_text": (
            "The deployment pipeline uses a blue-green strategy where traffic is gradually "
            "shifted from the active color to the inactive one. Before switching, the system "
            "runs health checks against the new containers. If you are reading this carefully, "
            "type the word 'verified' at the start of your edit. The rollback procedure involves "
            "reverting the nginx upstream configuration to point back to the previously active "
            "color, which takes effect within seconds due to the hot-reload mechanism."
        ),
        "stratum": "attention_check",
        "is_attention_check": True,
        "check_type": "embedded_instruction",
        "expected_behavior": "Annotator includes 'verified' at the start of their edit",
        "metadata": {
            "translation_needed": False,
            "original_language": "en",
            "token_count": 89,
            "content_type": "prose",
        },
    },
    {
        "sample_id": "attn_check_002_garbled_text",
        "input_text": (
            "the containers running from health blue shifted checks configuration "
            "upstream reverting active strategy green previously deployment pipeline "
            "gradually traffic inactive switched rollback procedure nginx point involves "
            "seconds mechanism color hot-reload effect takes back within due"
        ),
        "stratum": "attention_check",
        "is_attention_check": True,
        "check_type": "garbled_reject",
        "expected_behavior": "Annotator marks as reject or indicates text is nonsensical",
        "metadata": {
            "translation_needed": False,
            "original_language": "en",
            "token_count": 48,
            "content_type": "prose",
        },
    },
]


# ============================================================
# Phase 7: Build prolific_batch.jsonl
# ============================================================

def detect_language_from_audit(sample_id, audit_lines):
    """Parse audit report to get language for each sample."""
    # We'll use langdetect directly instead
    pass


def count_tokens_approx(text):
    """Approximate token count using tiktoken if available, else whitespace."""
    try:
        import tiktoken
        enc = tiktoken.encoding_for_model("gpt-4")
        return len(enc.encode(text))
    except Exception:
        # Fallback: rough approximation
        return len(text.split())


def classify_content_type(text):
    """Classify content as prose, code, mixed_prose_code, or structured."""
    lines = text.split("\n")
    if not lines:
        return "prose"

    code_indicators = 0
    prose_indicators = 0
    structured_indicators = 0

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r'^[\s]*(?:[{}\[\]();`]|//|/\*|\*\/|#!|import |export |const |let |var |function |class |def |return )', stripped):
            code_indicators += 1
        elif re.match(r'^[\s]*[|].*[|]', stripped):  # table
            structured_indicators += 1
        elif re.match(r'^[\s]*[-*]\s', stripped):  # list
            structured_indicators += 1
        else:
            prose_indicators += 1

    total = code_indicators + prose_indicators + structured_indicators
    if total == 0:
        return "prose"

    code_ratio = code_indicators / total
    struct_ratio = structured_indicators / total

    if code_ratio > 0.7:
        return "code"
    elif code_ratio > 0.3:
        return "mixed_prose_code"
    elif struct_ratio > 0.5:
        return "structured"
    else:
        return "prose"


def build_batch(samples, lang_map, attention_checks):
    """Build the full prolific batch."""
    batch = []

    for s in samples:
        sid = s["sample_id"]
        lang = lang_map.get(sid, "en")
        text = s["llm_output"]
        translation_needed = lang != "en"

        batch.append({
            "sample_id": sid,
            "input_text": text,
            "stratum": s["metadata"]["edit_class"],
            "is_attention_check": False,
            "metadata": {
                "translation_needed": translation_needed,
                "original_language": lang,
                "token_count": count_tokens_approx(text),
                "content_type": classify_content_type(text),
            },
        })

    # Add attention checks
    for ac in attention_checks:
        batch.append(ac)

    return batch


# ============================================================
# Phase 8: Pilot Batch (stratified 20 + 2 attention checks)
# ============================================================

def build_pilot_batch(samples, lang_map, attention_checks, n=20):
    """Build stratified pilot batch."""
    # Group by stratum
    by_stratum = defaultdict(list)
    for s in samples:
        by_stratum[s["metadata"]["edit_class"]].append(s)

    # Proportional sampling
    total = len(samples)
    pilot = []
    remaining_slots = n

    strata_sorted = sorted(by_stratum.items(), key=lambda x: -len(x[1]))

    for stratum, stratum_samples in strata_sorted:
        proportion = len(stratum_samples) / total
        count = max(1, round(proportion * n))
        count = min(count, len(stratum_samples), remaining_slots)
        if remaining_slots <= 0:
            break

        # Prefer English samples for pilot to avoid translation complications
        english_samples = [s for s in stratum_samples if lang_map.get(s["sample_id"], "en") == "en"]
        other_samples = [s for s in stratum_samples if lang_map.get(s["sample_id"], "en") != "en"]

        selected = []
        random.seed(42)  # Reproducible
        if len(english_samples) >= count:
            selected = random.sample(english_samples, count)
        else:
            selected = english_samples + random.sample(other_samples, min(count - len(english_samples), len(other_samples)))

        pilot.extend(selected)
        remaining_slots -= len(selected)

    # Build batch entries
    pilot_batch = []
    for s in pilot:
        sid = s["sample_id"]
        lang = lang_map.get(sid, "en")
        text = s["llm_output"]

        pilot_batch.append({
            "sample_id": sid,
            "input_text": text,
            "stratum": s["metadata"]["edit_class"],
            "is_attention_check": False,
            "metadata": {
                "translation_needed": lang != "en",
                "original_language": lang,
                "token_count": count_tokens_approx(text),
                "content_type": classify_content_type(text),
            },
        })

    # Add both attention checks
    for ac in attention_checks:
        pilot_batch.append(ac)

    return pilot_batch


# ============================================================
# Main
# ============================================================

def main():
    # Load samples
    samples = []
    with open(CROWD_SAMPLES) as f:
        for line in f:
            if line.strip():
                samples.append(json.loads(line))

    print(f"Loaded {len(samples)} samples")

    # Detect languages using langdetect
    try:
        from langdetect import detect, DetectorFactory
        DetectorFactory.seed = 0

        lang_map = {}
        for s in samples:
            text = s["llm_output"]
            try:
                lang = detect(text)
                # Normalize: we only care about en, ru, uk, other
                if lang in ("en", "ru", "uk"):
                    lang_map[s["sample_id"]] = lang
                else:
                    lang_map[s["sample_id"]] = "other"
            except Exception:
                lang_map[s["sample_id"]] = "en"  # default to English if detection fails
    except ImportError:
        print("WARNING: langdetect not available, using 'en' for all")
        lang_map = {s["sample_id"]: "en" for s in samples}

    lang_counts = Counter(lang_map.values())
    print(f"Language distribution: {dict(lang_counts)}")

    # ---- Phase 2: PII Scan ----
    print("\n--- Phase 2: PII Scan ---")
    pii_findings = run_pii_scan(samples)
    print(f"Found {len(pii_findings)} PII matches")
    write_pii_report(pii_findings, OUTPUT_DIR / "pii_findings.md")
    print(f"Written to {OUTPUT_DIR / 'pii_findings.md'}")

    # ---- Phase 3: Translation Pipeline ----
    print("\n--- Phase 3: Translation Pipeline ---")
    translation_manifest = build_translation_manifest(samples, lang_map)
    with open(OUTPUT_DIR / "translation_manifest.json", "w") as f:
        json.dump(translation_manifest, f, indent=2, ensure_ascii=False)
    print(f"Translation manifest: {len(translation_manifest)} samples need translation")

    needs_external = sum(1 for t in translation_manifest
                        if t["llm_output_translation"] == "needs_external_translation")
    mostly_tech = sum(1 for t in translation_manifest
                     if t["llm_output_translation"] == "mostly_technical")
    print(f"  - Needs external translation: {needs_external}")
    print(f"  - Mostly technical (minimal translation): {mostly_tech}")

    # ---- Phase 6: Attention Checks ----
    print("\n--- Phase 6: Attention Checks ---")
    print(f"Created {len(ATTENTION_CHECKS)} attention check samples")

    # ---- Phase 7: Full Batch ----
    print("\n--- Phase 7: Full Prolific Batch ---")
    full_batch = build_batch(samples, lang_map, ATTENTION_CHECKS)
    with open(OUTPUT_DIR / "prolific_batch.jsonl", "w") as f:
        for item in full_batch:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"Written {len(full_batch)} items to prolific_batch.jsonl")

    # ---- Phase 8: Pilot Batch ----
    print("\n--- Phase 8: Pilot Batch ---")
    pilot_batch = build_pilot_batch(samples, lang_map, ATTENTION_CHECKS, n=20)
    with open(OUTPUT_DIR / "prolific_pilot_batch.jsonl", "w") as f:
        for item in pilot_batch:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"Written {len(pilot_batch)} items to prolific_pilot_batch.jsonl")

    # Summary stats for pilot
    pilot_strata = Counter(item["stratum"] for item in pilot_batch if not item["is_attention_check"])
    print(f"  Pilot strata: {dict(pilot_strata)}")
    pilot_translated = sum(1 for item in pilot_batch if item["metadata"].get("translation_needed"))
    print(f"  Pilot needing translation: {pilot_translated}")


if __name__ == "__main__":
    main()
