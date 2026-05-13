#!/usr/bin/env python3
"""
Full extraction of Ukrainian court decisions from local DB for LexTreme.

Connects directly via psycopg2 to local PostgreSQL.
Processes ALL available decisions (not just a sample).

Usage:
    python3 scripts/lextreme/extract-full-local.py
    python3 scripts/lextreme/extract-full-local.py --target-per-class 10000
"""

import argparse
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

import psycopg2
import psycopg2.extras

OUTPUT_DIR = Path(__file__).parent / "output"

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "secondlayer_local",
    "user": "secondlayer",
    "password": "local_dev_password",
}

BATCH_SIZE = 10000
SEED = 42

FACTS_RE = re.compile(
    r'[ВУ]\s*[СС]\s*Т\s*А\s*Н\s*О\s*В\s*И\s*В\s*:',
    re.IGNORECASE
)
DISP_RE = re.compile(
    r'(?:В\s*И\s*Р\s*І\s*Ш\s*И\s*В|У\s*Х\s*В\s*А\s*Л\s*И\s*В|П\s*О\s*С\s*Т\s*А\s*Н\s*О\s*В\s*И\s*В)\s*:',
    re.IGNORECASE
)


def normalize_text(text):
    return re.sub(r'\s+', ' ', text)


def extract_facts(text):
    text_norm = normalize_text(text)
    m = FACTS_RE.search(text_norm)
    if not m:
        return None
    facts_start = m.end()

    dm = DISP_RE.search(text_norm, facts_start)
    if not dm:
        return None

    facts = text_norm[facts_start:dm.start()].strip()
    if len(facts) < 200:
        return None
    if len(facts) > 10000:
        facts = facts[:10000]
    return facts


def extract_outcome(text):
    text_norm = normalize_text(text)
    matches = list(DISP_RE.finditer(text_norm))
    if not matches:
        section = text_norm[int(len(text_norm) * 0.8):]
    else:
        section = text_norm[matches[-1].start():]

    s = section.lower()
    if "частков" in s:
        return "partial"
    if "задовольн" in s:
        return "approved"
    if "відмов" in s:
        return "dismissed"
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-per-class", type=int, default=None,
                        help="Target per class (default: use all)")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    random.seed(args.seed)

    conn = psycopg2.connect(**DB_CONFIG)
    conn.set_session(readonly=True)

    print("🇺🇦 Full extraction from local DB")

    # Count available
    with conn.cursor() as cur:
        for jk, name in [(1, "Цивільне"), (3, "Господарське")]:
            cur.execute("""
                SELECT COUNT(*) FROM edrsr_documents d
                JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
                    AND f.adj_year IN (2013, 2014)
                WHERE d.judgment_code = 3 AND d.justice_kind = %s
                  AND d.adjudication_date >= '2013-01-01'
                  AND d.adjudication_date < '2015-01-01'
                  AND f.text_length BETWEEN 500 AND 200000
            """, (jk,))
            count = cur.fetchone()[0]
            print(f"  {name}: {count:,}")

    all_results = []

    for jk, jk_name in [(1, "civil"), (3, "commercial")]:
        print(f"\n📋 {jk_name.upper()} (justice_kind={jk}):")

        with conn.cursor(name=f"lextreme_{jk_name}", cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.itersize = BATCH_SIZE
            cur.execute("""
                SELECT d.doc_id, f.full_text
                FROM edrsr_documents d
                JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
                    AND f.adj_year IN (2013, 2014)
                WHERE d.judgment_code = 3
                  AND d.justice_kind = %s
                  AND d.adjudication_date >= '2013-01-01'
                  AND d.adjudication_date < '2015-01-01'
                  AND f.text_length BETWEEN 500 AND 200000
            """, (jk,))

            processed = 0
            valid = 0
            skipped = Counter()

            for row in cur:
                processed += 1
                text = row["full_text"]

                facts = extract_facts(text)
                if not facts:
                    skipped["no_facts"] += 1
                    continue

                outcome = extract_outcome(text)
                if not outcome:
                    skipped["no_outcome"] += 1
                    continue

                valid += 1
                all_results.append({
                    "text": facts,
                    "label": outcome,
                    "language": "uk",
                    "justice_kind": jk_name,
                    "doc_id": str(row["doc_id"]),
                })

                if processed % 50000 == 0:
                    dist = Counter(r["label"] for r in all_results if r["justice_kind"] == jk_name)
                    print(f"  ... {processed:,} processed, {valid:,} valid  {dict(dist)}")

        dist = Counter(r["label"] for r in all_results if r["justice_kind"] == jk_name)
        print(f"  Done: {processed:,} processed, {valid:,} valid")
        print(f"  Skipped: {dict(skipped)}")
        print(f"  Distribution: {dict(dist)}")

    conn.close()

    print(f"\n📊 Combined: {len(all_results):,} samples")
    combined_dist = Counter(r["label"] for r in all_results)
    print(f"  {dict(combined_dist)}")

    # Balance if requested
    if args.target_per_class:
        by_label = {}
        for item in all_results:
            by_label.setdefault(item["label"], []).append(item)

        balanced = []
        for label in sorted(by_label.keys()):
            items = by_label[label]
            random.shuffle(items)
            n = min(len(items), args.target_per_class)
            balanced.extend(items[:n])
            print(f"  {label}: {n:,} of {len(items):,} sampled")

        random.shuffle(balanced)
        data = balanced
    else:
        random.shuffle(all_results)
        data = all_results

    total = len(data)
    print(f"\n⚖️  Final: {total:,} samples")
    final_dist = Counter(d["label"] for d in data)
    print(f"  {dict(final_dist)}")

    # Split 80/10/10
    train_end = int(total * 0.8)
    val_end = int(total * 0.9)
    splits = {
        "train": data[:train_end],
        "validation": data[train_end:val_end],
        "test": data[val_end:],
    }

    # Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for split_name, items in splits.items():
        path = OUTPUT_DIR / f"lextreme-ukr-{split_name}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for item in items:
                row = {"text": item["text"], "label": item["label"], "language": item["language"]}
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        dist = Counter(i["label"] for i in items)
        print(f"  {split_name}: {len(items):,} → {path}  {dict(dist)}")

    print(f"\n✅ Done!")


if __name__ == "__main__":
    main()
