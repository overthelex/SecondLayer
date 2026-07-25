#!/usr/bin/env python3
"""
Server-side extraction of Ukrainian court decisions for LexTreme.

Uses year-partitioned tables for efficient extraction (avoids full-table JOINs).

Usage:
    scp scripts/lextreme/extract-server-side.py prod:/tmp/
    ssh prod "python3 /tmp/extract-server-side.py"
    scp prod:/tmp/lextreme-ukr-*.jsonl scripts/lextreme/output/
"""

import json
import random
import re
import subprocess
import sys
from collections import Counter

CONTAINER = "secondlayer-postgres-prod"
PGUSER = "secondlayer"
PGDB = "secondlayer_prod"

YEARS = [2014, 2013, 2012, 2011, 2010]  # years with actual full text content
BATCH_SIZE = 5000
TARGET_PER_CLASS = 5000
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
    """Collapse spaced-out characters common in formatted court decisions."""
    text = re.sub(r'\s+', ' ', text)
    return text


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


def docker_psql(sql, timeout=120):
    cmd = [
        "docker", "exec", CONTAINER,
        "psql", "-U", PGUSER, "-d", PGDB, "-t", "-A", "-c", sql
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        print(f"  SQL error: {r.stderr[:200]}", file=sys.stderr)
        return ""
    return r.stdout.strip()


def extract_year(year, justice_kind, limit=5000):
    """Extract decisions from a specific year partition.

    Strategy: start from edrsr_documents (fast partition pruning on adjudication_date),
    then fetch full text. The justice_kind in edrsr_fulltext is mostly NULL,
    so we filter on edrsr_documents.justice_kind instead.
    """
    jk_name = "civil" if justice_kind == 1 else "commercial"

    # Use tab as separator, replace newlines and tabs in text
    raw = docker_psql(f"""
        SELECT f.doc_id || E'\\t' || REPLACE(REPLACE(f.full_text, E'\\n', ' '), E'\\t', ' ')
        FROM edrsr_documents d
        JOIN edrsr_fulltext f ON f.doc_id = d.doc_id AND f.adj_year = {year}
        WHERE d.adjudication_date >= '{year}-01-01'
          AND d.adjudication_date < '{year + 1}-01-01'
          AND d.judgment_code = 3
          AND d.justice_kind = {justice_kind}
          AND f.full_text IS NOT NULL
          AND f.text_length BETWEEN 2000 AND 100000
        LIMIT {limit}
    """, timeout=300)

    if not raw:
        return []

    results = []
    for line in raw.split("\n"):
        if "\t" not in line:
            continue
        doc_id, text = line.split("\t", 1)

        facts = extract_facts(text)
        if not facts:
            continue

        outcome = extract_outcome(text)
        if not outcome:
            continue

        results.append({
            "text": facts,
            "label": outcome,
            "language": "uk",
            "justice_kind": jk_name,
            "doc_id": doc_id,
        })

    return results


def main():
    random.seed(SEED)

    print("🇺🇦 Extracting Ukrainian court decisions for LexTreme")
    print(f"   Years: {YEARS[0]}-{YEARS[-1]}, Target: {TARGET_PER_CLASS} per class")
    print()

    all_results = []

    for jk, jk_name in [(1, "civil"), (3, "commercial")]:
        print(f"📋 {jk_name.upper()} decisions (justice_kind={jk}):")
        jk_results = []

        for year in YEARS:
            results = extract_year(year, jk, limit=BATCH_SIZE)
            jk_results.extend(results)
            dist = Counter(r["label"] for r in results)
            print(f"  {year}: {len(results)} valid  {dict(dist) if dist else '{}'}")

            # Check if we already have enough
            total_dist = Counter(r["label"] for r in jk_results)
            min_class = min(total_dist.values()) if len(total_dist) >= 3 else 0
            if min_class >= TARGET_PER_CLASS:
                print(f"  ✅ Enough data for {jk_name}: {dict(total_dist)}")
                break

        total_dist = Counter(r["label"] for r in jk_results)
        print(f"  Total {jk_name}: {len(jk_results)} samples  {dict(total_dist)}")
        all_results.extend(jk_results)
        print()

    print(f"📊 Combined: {len(all_results)} samples")
    combined_dist = Counter(r["label"] for r in all_results)
    print(f"  Distribution: {dict(combined_dist)}")

    # Balance classes
    by_label = {}
    for item in all_results:
        by_label.setdefault(item["label"], []).append(item)

    balanced = []
    for label in sorted(by_label.keys()):
        items = by_label[label]
        random.shuffle(items)
        n = min(len(items), TARGET_PER_CLASS)
        balanced.extend(items[:n])
        print(f"  {label}: {n} of {len(items)} sampled")

    random.shuffle(balanced)
    total = len(balanced)
    print(f"\n⚖️  Balanced total: {total}")

    # Split 80/10/10
    train_end = int(total * 0.8)
    val_end = int(total * 0.9)

    splits = {
        "train": balanced[:train_end],
        "validation": balanced[train_end:val_end],
        "test": balanced[val_end:],
    }

    for split_name, items in splits.items():
        path = f"/tmp/lextreme-ukr-{split_name}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for item in items:
                row = {"text": item["text"], "label": item["label"], "language": item["language"]}
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        dist = Counter(i["label"] for i in items)
        print(f"  {split_name}: {len(items):,} → {path}  {dict(dist)}")

    print(f"\n✅ Done!")
    print(f"   Download: scp prod:/tmp/lextreme-ukr-*.jsonl scripts/lextreme/output/")


if __name__ == "__main__":
    main()
