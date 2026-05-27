#!/usr/bin/env python3
"""
Enrich Hungarian court decisions with outcome labels.

Strategy:
  1. Regex on dispositive section for common Hungarian outcome keywords
  2. Bedrock Claude Haiku fallback for records where regex fails

Hungarian outcome patterns:
  - granted:  "helyt ad", "megalapozott", "keresetnek helyt ad"
  - denied:   "elutasítja", "megalapozatlan", "keresetet elutasítja"
  - partial:  "részben helyt ad", "részben megalapozott"

Usage:
  python3 scripts/benchmark/enrich_hu_outcome.py [--db-url URL] [--dry-run] [--llm-fallback]
"""

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local",
)

OUTCOME_GRANTED = re.compile(
    r"(?:"
    r"helyt\s+ad(?:ja|ott)?"
    r"|keres(?:et(?:nek|et|ét)?|etet)\s+(?:a\s+bíróság\s+)?(?:teljes\s+egészében\s+)?helyt\s+ad"
    r"|megalapozott(?:nak\s+találta)?"
    r"|kötelezi\s+(?:az?\s+)?alperes"
    r"|marasztalja"
    r")",
    re.IGNORECASE,
)

OUTCOME_DENIED = re.compile(
    r"(?:"
    r"elutasítja"
    r"|keresetet?\s+elutasít"
    r"|megalapozatlan"
    r"|nem\s+alapos"
    r"|helyt\s+nem\s+ad"
    r")",
    re.IGNORECASE,
)

OUTCOME_PARTIAL = re.compile(
    r"(?:"
    r"részben\s+helyt\s+ad"
    r"|részben\s+megalapozott"
    r"|részben\s+elutasít"
    r"|a\s+keresetet\s+részben"
    r")",
    re.IGNORECASE,
)

BEDROCK_WORKERS = [
    {"region": "eu-central-1", "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "eu-west-1",    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "us-east-1",    "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "us-west-2",    "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
]

CLASSIFICATION_PROMPT = """Classify the outcome of this Hungarian court decision. Read the dispositive section and return ONLY one label.

Labels:
- granted (keresetnek helyt ad, marasztal)
- denied (keresetet elutasítja)
- partial (részben helyt ad)
- other (cannot determine)

Text (last 2000 chars):
{text}

Label:"""

print_lock = Lock()
stats = {"regex_granted": 0, "regex_denied": 0, "regex_partial": 0, "regex_fail": 0, "llm_ok": 0, "llm_fail": 0}


def log(msg):
    with print_lock:
        print(msg, flush=True)


def classify_regex(text):
    if not text or len(text) < 100:
        return None
    tail = text[-3000:]
    if OUTCOME_PARTIAL.search(tail):
        return "partial"
    if OUTCOME_GRANTED.search(tail):
        return "granted"
    if OUTCOME_DENIED.search(tail):
        return "denied"
    return None


def classify_llm(text, worker):
    import boto3
    client = boto3.client("bedrock-runtime", region_name=worker["region"])
    prompt = CLASSIFICATION_PROMPT.format(text=text[-2000:])

    try:
        resp = client.invoke_model(
            modelId=worker["model"],
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 20,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
        body = json.loads(resp["body"].read())
        answer = body["content"][0]["text"].strip().lower()
        for label in ("granted", "denied", "partial", "other"):
            if label in answer:
                return label
        return None
    except Exception as e:
        log(f"  LLM error ({worker['region']}): {e}")
        return None


def ensure_outcome_column(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'hu_court_decisions' AND column_name = 'enriched_outcome'
    """)
    if not cur.fetchone():
        cur.execute("ALTER TABLE hu_court_decisions ADD COLUMN enriched_outcome TEXT")
        conn.commit()
        log("Added enriched_outcome column to hu_court_decisions")
    cur.close()


def process_batch_regex(db_url, batch_size=5000, dry_run=False):
    read_conn = psycopg2.connect(db_url)
    write_conn = psycopg2.connect(db_url)
    write_conn.autocommit = True

    cur = read_conn.cursor(name="hu_outcome_cursor")
    cur.itersize = batch_size

    cur.execute("""
        SELECT id, full_text FROM hu_court_decisions
        WHERE full_text IS NOT NULL AND length(full_text) > 500
          AND enriched_outcome IS NULL
        ORDER BY id
    """)

    update_cur = write_conn.cursor()
    batch = []
    total = 0
    failed_ids = []

    for row in cur:
        doc_id, text = row
        outcome = classify_regex(text)
        total += 1

        if outcome:
            stats[f"regex_{outcome}"] += 1
            batch.append((outcome, doc_id))
        else:
            stats["regex_fail"] += 1
            failed_ids.append(doc_id)

        if len(batch) >= 1000 and not dry_run:
            psycopg2.extras.execute_batch(
                update_cur,
                "UPDATE hu_court_decisions SET enriched_outcome = %s WHERE id = %s",
                batch,
            )
            batch = []

        if total % 10000 == 0:
            log(f"  Processed {total:,} -- granted={stats['regex_granted']}, denied={stats['regex_denied']}, partial={stats['regex_partial']}, fail={stats['regex_fail']}")

    if batch and not dry_run:
        psycopg2.extras.execute_batch(
            update_cur,
            "UPDATE hu_court_decisions SET enriched_outcome = %s WHERE id = %s",
            batch,
        )

    cur.close()
    update_cur.close()
    read_conn.close()
    write_conn.close()

    log(f"\nRegex phase complete: {total:,} processed")
    log(f"  granted={stats['regex_granted']}, denied={stats['regex_denied']}, partial={stats['regex_partial']}")
    log(f"  regex_fail={stats['regex_fail']} ({stats['regex_fail']/max(total,1)*100:.1f}%)")

    return failed_ids


def process_llm_fallback(db_url, failed_ids, dry_run=False):
    if not failed_ids:
        return

    log(f"\nLLM fallback for {len(failed_ids):,} records...")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    update_cur = conn.cursor()
    batch = []
    worker_idx = 0

    for i, doc_id in enumerate(failed_ids):
        cur.execute("SELECT full_text FROM hu_court_decisions WHERE id = %s", (doc_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            continue

        worker = BEDROCK_WORKERS[worker_idx % len(BEDROCK_WORKERS)]
        worker_idx += 1

        outcome = classify_llm(row[0], worker)
        if outcome and outcome != "other":
            stats["llm_ok"] += 1
            batch.append((outcome, doc_id))
        else:
            stats["llm_fail"] += 1

        if len(batch) >= 100 and not dry_run:
            psycopg2.extras.execute_batch(
                update_cur,
                "UPDATE hu_court_decisions SET enriched_outcome = %s WHERE id = %s",
                batch,
            )
            conn.commit()
            batch = []

        if (i + 1) % 500 == 0:
            log(f"  LLM: {i+1}/{len(failed_ids)} -- ok={stats['llm_ok']}, fail={stats['llm_fail']}")

        time.sleep(0.05)

    if batch and not dry_run:
        psycopg2.extras.execute_batch(
            update_cur,
            "UPDATE hu_court_decisions SET enriched_outcome = %s WHERE id = %s",
            batch,
        )
        conn.commit()

    cur.close()
    update_cur.close()
    conn.close()

    log(f"\nLLM phase complete: ok={stats['llm_ok']}, fail={stats['llm_fail']}")


def main():
    parser = argparse.ArgumentParser(description="Enrich HU court decisions with outcome labels")
    parser.add_argument("--db-url", default=DB_URL)
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--llm-fallback", action="store_true", help="Use Bedrock Haiku for regex failures")
    args = parser.parse_args()

    conn = psycopg2.connect(args.db_url)
    conn.autocommit = True

    if not args.dry_run:
        ensure_outcome_column(conn)

    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM hu_court_decisions")
    total = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM hu_court_decisions WHERE full_text IS NOT NULL AND length(full_text) > 500")
    with_text = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM hu_court_decisions WHERE enriched_outcome IS NOT NULL")
    already_done = cur.fetchone()[0]
    cur.close()
    conn.close()

    log(f"HU court decisions: {total:,} total, {with_text:,} with fulltext, {already_done:,} already enriched")

    if already_done >= with_text:
        log("All records already enriched. Nothing to do.")
        return

    failed_ids = process_batch_regex(args.db_url, dry_run=args.dry_run)

    if args.llm_fallback and failed_ids:
        process_llm_fallback(args.db_url, failed_ids, dry_run=args.dry_run)

    log("\n=== Summary ===")
    total_classified = stats["regex_granted"] + stats["regex_denied"] + stats["regex_partial"] + stats["llm_ok"]
    total_processed = total_classified + stats["regex_fail"] - stats["llm_ok"] + stats["llm_fail"]
    log(f"Total classified: {total_classified:,} / {total_processed:,} ({total_classified/max(total_processed,1)*100:.1f}%)")
    log(f"  granted={stats['regex_granted'] + stats.get('llm_granted', 0)}")
    log(f"  denied={stats['regex_denied']}")
    log(f"  partial={stats['regex_partial']}")
    if args.dry_run:
        log("(dry-run mode -- no changes written)")


if __name__ == "__main__":
    main()
