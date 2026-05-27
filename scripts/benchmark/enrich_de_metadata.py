#!/usr/bin/env python3
"""
Enrich German court decisions with subject_area and outcome labels.

Strategy:
  subject_area:
    1. Court-name-to-subject lookup (covers ~80% -- German courts are specialized)
    2. Bedrock Haiku fallback for ambiguous courts (Landgericht, OLG, etc.)
  outcome:
    1. Regex on tenor column for common German dispositive keywords
    2. Bedrock Haiku fallback for regex failures

German court hierarchy -> subject area mapping:
  Federal courts (BGH, BVerwG, BAG, BSG, BFH, BVerfG, BPatG) directly map.
  State courts (LG, OLG, AG, VG, OVG, ArbG, SG, FG) map via prefix.

Usage:
  python3 scripts/benchmark/enrich_de_metadata.py [--db-url URL] [--dry-run] [--llm-fallback]
"""

import argparse
import json
import os
import re
import sys
import time

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local",
)

COURT_TO_SUBJECT = {
    "BGH": "Zivilrecht",
    "BVerwG": "Verwaltungsrecht",
    "BAG": "Arbeitsrecht",
    "BSG": "Sozialrecht",
    "BFH": "Steuerrecht",
    "BVerfG": "Verfassungsrecht",
    "BPatG": "Patentrecht",
    "OLG": "Zivilrecht",
    "LG": "Zivilrecht",
    "AG": "Zivilrecht",
    "KG": "Zivilrecht",
    "OVG": "Verwaltungsrecht",
    "VGH": "Verwaltungsrecht",
    "VG": "Verwaltungsrecht",
    "LAG": "Arbeitsrecht",
    "ArbG": "Arbeitsrecht",
    "LSG": "Sozialrecht",
    "SG": "Sozialrecht",
    "FG": "Steuerrecht",
    "LVerfG": "Verfassungsrecht",
    "VerfGH": "Verfassungsrecht",
    "StGH": "Verfassungsrecht",
}

COURT_NAME_PATTERNS = [
    (re.compile(r"\bBundesgerichtshof\b", re.I), "Zivilrecht"),
    (re.compile(r"\bBundesverwaltungsgericht\b", re.I), "Verwaltungsrecht"),
    (re.compile(r"\bBundesarbeitsgericht\b", re.I), "Arbeitsrecht"),
    (re.compile(r"\bBundessozialgericht\b", re.I), "Sozialrecht"),
    (re.compile(r"\bBundesfinanzhof\b", re.I), "Steuerrecht"),
    (re.compile(r"\bBundesverfassungsgericht\b", re.I), "Verfassungsrecht"),
    (re.compile(r"\bBundespatentgericht\b", re.I), "Patentrecht"),
    (re.compile(r"\bOberlandesgericht\b", re.I), "Zivilrecht"),
    (re.compile(r"\bLandgericht\b", re.I), "Zivilrecht"),
    (re.compile(r"\bAmtsgericht\b", re.I), "Zivilrecht"),
    (re.compile(r"\bKammergericht\b", re.I), "Zivilrecht"),
    (re.compile(r"\bOberverwaltungsgericht\b", re.I), "Verwaltungsrecht"),
    (re.compile(r"\bVerwaltungsgericht(?:shof)?\b", re.I), "Verwaltungsrecht"),
    (re.compile(r"\bLandesarbeitsgericht\b", re.I), "Arbeitsrecht"),
    (re.compile(r"\bArbeitsgericht\b", re.I), "Arbeitsrecht"),
    (re.compile(r"\bLandessozialgericht\b", re.I), "Sozialrecht"),
    (re.compile(r"\bSozialgericht\b", re.I), "Sozialrecht"),
    (re.compile(r"\bFinanzgericht\b", re.I), "Steuerrecht"),
    (re.compile(r"\bVerfassungsgericht(?:shof)?\b", re.I), "Verfassungsrecht"),
    (re.compile(r"\bStaatsgerichtshof\b", re.I), "Verfassungsrecht"),
]

STRAFRECHT_INDICATORS = re.compile(
    r"\b(?:Strafsenat|Strafkammer|Strafrecht|Angeklagte[rn]?|Freispruch|Freiheitsstrafe|Geldstrafe|StGB|StPO)\b",
    re.I,
)

OUTCOME_GRANTED = re.compile(
    r"(?:"
    r"(?:wird|werden)\s+(?:verurteilt|stattgegeben)"
    r"|(?:der\s+)?(?:Klage|Berufung|Revision)\s+(?:wird\s+)?stattgegeben"
    r"|(?:die\s+)?Beklagte[rn]?\s+(?:wird|werden)\s+verurteilt"
    r"|(?:hat|haben)\s+(?:an\s+(?:die|den)\s+Kläger(?:in)?\s+)?zu\s+zahlen"
    r")",
    re.IGNORECASE,
)

OUTCOME_DENIED = re.compile(
    r"(?:"
    r"(?:wird|werden)\s+(?:abgewiesen|zurückgewiesen|verworfen)"
    r"|(?:die\s+)?(?:Klage|Berufung|Revision)\s+wird\s+(?:abgewiesen|zurückgewiesen|verworfen)"
    r"|(?:wird|werden)\s+als\s+unbegründet\s+(?:abgewiesen|zurückgewiesen)"
    r"|(?:wird|werden)\s+als\s+unzulässig\s+verworfen"
    r")",
    re.IGNORECASE,
)

OUTCOME_PARTIAL = re.compile(
    r"(?:"
    r"teilweise\s+stattgegeben"
    r"|(?:im\s+[Üü]brigen|im\s+Weiteren)\s+(?:wird\s+(?:die\s+)?(?:Klage|Berufung)\s+)?abgewiesen"
    r"|(?:wird\s+)?(?:der\s+Klage\s+)?teilweise\s+(?:stattgegeben|abgewiesen)"
    r")",
    re.IGNORECASE,
)

BEDROCK_WORKERS = [
    {"region": "eu-central-1", "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "eu-west-1",    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "us-east-1",    "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "us-west-2",    "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
]

SUBJECT_PROMPT = """Classify the subject area of this German court decision. Return ONLY the category label.

Categories: Zivilrecht, Strafrecht, Verwaltungsrecht, Arbeitsrecht, Sozialrecht, Steuerrecht, Verfassungsrecht, Patentrecht

Text (first 1500 chars):
{text}

Category:"""

OUTCOME_PROMPT = """Classify the outcome of this German court decision based on the tenor. Return ONLY one label.

Labels:
- granted (Klage stattgegeben, verurteilt)
- denied (Klage abgewiesen, zurückgewiesen)
- partial (teilweise stattgegeben)
- other (cannot determine)

Tenor:
{text}

Label:"""


def classify_subject_by_court(court_type, court_name):
    if court_type and court_type in COURT_TO_SUBJECT:
        return COURT_TO_SUBJECT[court_type]
    if court_name:
        for pattern, subject in COURT_NAME_PATTERNS:
            if pattern.search(court_name):
                return subject
    return None


def refine_subject_with_text(subject, text):
    if subject == "Zivilrecht" and text and STRAFRECHT_INDICATORS.search(text[:5000]):
        return "Strafrecht"
    return subject


def classify_outcome_regex(tenor, full_text):
    text = tenor or ""
    if not text and full_text:
        text = full_text[-3000:]
    if len(text) < 50:
        return None
    if OUTCOME_PARTIAL.search(text):
        return "partial"
    if OUTCOME_GRANTED.search(text):
        return "granted"
    if OUTCOME_DENIED.search(text):
        return "denied"
    return None


def classify_llm(text, prompt_template, valid_labels, worker):
    import boto3
    client = boto3.client("bedrock-runtime", region_name=worker["region"])
    prompt = prompt_template.format(text=text)

    try:
        resp = client.invoke_model(
            modelId=worker["model"],
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 30,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
        body = json.loads(resp["body"].read())
        answer = body["content"][0]["text"].strip()
        for label in valid_labels:
            if label.lower() in answer.lower():
                return label
        return None
    except Exception as e:
        print(f"  LLM error ({worker['region']}): {e}", flush=True)
        return None


def ensure_columns(conn):
    cur = conn.cursor()
    for col in ["enriched_subject_area", "enriched_outcome"]:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'de_court_decisions' AND column_name = %s
        """, (col,))
        if not cur.fetchone():
            cur.execute(f"ALTER TABLE de_court_decisions ADD COLUMN {col} TEXT")
            print(f"Added {col} column to de_court_decisions")
    conn.commit()
    cur.close()


def main():
    parser = argparse.ArgumentParser(description="Enrich DE court decisions with subject_area and outcome")
    parser.add_argument("--db-url", default=DB_URL)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--llm-fallback", action="store_true", help="Use Bedrock for ambiguous cases")
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()

    conn = psycopg2.connect(args.db_url)
    conn.autocommit = True

    if not args.dry_run:
        ensure_columns(conn)

    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM de_court_decisions")
    total = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM de_court_decisions WHERE full_text IS NOT NULL AND length(full_text) > 500")
    with_text = cur.fetchone()[0]
    print(f"DE court decisions: {total:,} total, {with_text:,} with fulltext")
    cur.close()
    conn.close()

    conn = psycopg2.connect(args.db_url)
    conn.autocommit = True
    cur = conn.cursor()

    stats = {
        "subject_court_map": 0, "subject_strafrecht_refine": 0, "subject_fail": 0,
        "outcome_regex": 0, "outcome_fail": 0,
    }
    processed = 0
    llm_subject_ids = []
    llm_outcome_ids = []
    last_id = ""

    while True:
        cur.execute("""
            SELECT id, court_type, court_name, subject_area, tenor, full_text
            FROM de_court_decisions
            WHERE (enriched_subject_area IS NULL OR enriched_outcome IS NULL)
              AND id > %s
            ORDER BY id
            LIMIT %s
        """, (last_id, args.batch_size))
        rows = cur.fetchall()
        if not rows:
            break

        batch = []
        for row in rows:
            doc_id, court_type, court_name, existing_subject, tenor, full_text = row
            processed += 1
            last_id = doc_id

            subject = classify_subject_by_court(court_type, court_name)
            if subject:
                subject = refine_subject_with_text(subject, full_text)
                if subject == "Strafrecht" and classify_subject_by_court(court_type, court_name) != "Strafrecht":
                    stats["subject_strafrecht_refine"] += 1
                stats["subject_court_map"] += 1
            else:
                stats["subject_fail"] += 1
                llm_subject_ids.append(doc_id)

            outcome = classify_outcome_regex(tenor, full_text)
            if outcome:
                stats["outcome_regex"] += 1
            else:
                stats["outcome_fail"] += 1
                llm_outcome_ids.append(doc_id)

            batch.append((subject, outcome, doc_id))

        if batch and not args.dry_run:
            psycopg2.extras.execute_batch(
                cur,
                """UPDATE de_court_decisions
                   SET enriched_subject_area = COALESCE(%s, enriched_subject_area),
                       enriched_outcome = COALESCE(%s, enriched_outcome)
                   WHERE id = %s""",
                batch,
            )

        if processed % 10000 == 0:
            print(
                f"  {processed:,} -- subject: map={stats['subject_court_map']}, fail={stats['subject_fail']} | "
                f"outcome: regex={stats['outcome_regex']}, fail={stats['outcome_fail']}",
                flush=True,
            )

    cur.close()
    conn.close()

    print(f"\n=== DE Enrichment Summary ===")
    print(f"Total processed: {processed:,}")
    print(f"Subject area: mapped={stats['subject_court_map']}, strafrecht_refined={stats['subject_strafrecht_refine']}, need_llm={stats['subject_fail']}")
    print(f"Outcome: regex={stats['outcome_regex']}, need_llm={stats['outcome_fail']}")

    if args.llm_fallback:
        print(f"\nLLM fallback: {len(llm_subject_ids)} subject + {len(llm_outcome_ids)} outcome records")
        print("LLM fallback not yet implemented in batch mode -- use enrich_metadata_llm.py")

    if args.dry_run:
        print("(dry-run mode -- no changes written)")


if __name__ == "__main__":
    main()
