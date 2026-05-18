#!/usr/bin/env python3
"""
Full extraction of Ukrainian court decisions for LexTreme.

Extracts decisions across three temporal epochs:
  - pre_war:    2008-2013
  - hybrid_war: 2014-2021
  - full_scale: 2022-2026

Each record includes adjudication_date for temporal train/val/test splitting.

Usage:
    python3 scripts/lextreme/extract-full-local.py                    # local DB
    python3 scripts/lextreme/extract-full-local.py --prod             # prod via SSH tunnel (port 5438)
    python3 scripts/lextreme/extract-full-local.py --prod --target-per-class 20000
    python3 scripts/lextreme/extract-full-local.py --prod --epochs full_scale hybrid_war
"""

import argparse
import json
import os
import random
import re
import sys
from collections import Counter
from pathlib import Path

import psycopg2
import psycopg2.extras

OUTPUT_DIR = Path(__file__).parent / "output"

DB_LOCAL = {
    "host": "localhost",
    "port": 5432,
    "dbname": "secondlayer_local",
    "user": "secondlayer",
    "password": "local_dev_password",
}

DB_PROD = {
    "host": "127.0.0.1",
    "port": int(os.environ.get("PROD_DB_PORT", "15438")),
    "dbname": "secondlayer_prod",
    "user": "secondlayer",
    "password": os.environ.get("PGPASSWORD", ""),
}

BATCH_SIZE = 10000
SEED = 42

EPOCHS = {
    "pre_war":    {"start": "2008-01-01", "end": "2014-01-01"},
    "hybrid_war": {"start": "2014-01-01", "end": "2022-01-01"},
    "full_scale": {"start": "2022-01-01", "end": "2027-01-01"},
}

# --- Section extraction ---

FACTS_START = re.compile(
    r'[вВуУ]\s*[сС]\s*[тТ]\s*[аА]\s*[нН]\s*[оО]\s*[вВ]\s*[иИі]\s*[вВлЛ]\s*:',
    re.IGNORECASE
)
DISPOSITIVE_START = re.compile(
    r'[вВ]\s*[иИі]\s*[рР]\s*[іІ]\s*[шШ]\s*[иИі]\s*[вВ]\s*:|'
    r'[пП]\s*[оО]\s*[сС]\s*[тТ]\s*[аА]\s*[нН]\s*[оО]\s*[вВ]\s*[иИі]\s*[вВ]\s*:|'
    r'[уУ]\s*[хХ]\s*[вВ]\s*[аА]\s*[лЛ]\s*[иИі]\s*[вВ]\s*:',
    re.IGNORECASE
)
GUIDED_BY = re.compile(r'[Кк]еруючись', re.IGNORECASE)

# --- Outcome classification ---

OUTCOME_PARTIAL = re.compile(
    r'задовольнити\s+частково|'
    r'частково\s+задовольнити|'
    r'позов(?:ні вимоги)?\s.*?задовольнити\s+частково',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_GRANTED = re.compile(
    r'позов(?:ні вимоги|ну заяву)?\s.*?задовол(?:ь|і)нити(?!\s+частково)|'
    r'позов\s.*?підлягає\s+задоволенню(?!\s+частково)|'
    r'задовол(?:ь|і)нити\s+позов|'
    r'[Зз]аяву\s.*?задовол(?:ь|і)нити|'
    r'задовол(?:ь|і)нити\s.*?заяву|'
    r'позов\s.*?задовол(?:ь|і)нити|'
    r'[Аа]дміністративний\s+позов\s*[-—–]\s*задовол(?:ь|і)нити|'
    r'[Сс]тягнути\s+з\s|'
    r'[Вв]ідшкодувати\s|'
    r'[Вв]изнати\s+протиправн',
    re.IGNORECASE | re.DOTALL
)
OUTCOME_DENIED = re.compile(
    r'(?:у|в)\s+задоволенні\s.*?відмовити|'
    r'позов(?:ні вимоги)?\s.*?відмовити|'
    r'відмовити\s+(?:у|в)\s+задоволенні|'
    r'позов\s.*?не\s+підлягає\s+задоволенню|'
    r'залишити\s.*?без\s+задоволення|'
    r'[ВвУу]\s+позові\s+відмовити|'
    r'відмовити\s+повністю',
    re.IGNORECASE | re.DOTALL
)


def extract_sections(text):
    facts_match = None
    for m in FACTS_START.finditer(text):
        before = text[max(0, m.start()-5):m.start()].strip()
        if not before or before.endswith((',', '-', '\n', ' ')):
            facts_match = m
            break

    dispositive_match = DISPOSITIVE_START.search(text)
    guided_match = GUIDED_BY.search(text)

    facts = ""
    dispositive = ""

    if facts_match:
        facts_start = facts_match.end()
        facts_end = guided_match.start() if guided_match else (dispositive_match.start() if dispositive_match else len(text))
        facts = text[facts_start:facts_end].strip()

    if dispositive_match:
        dispositive = text[dispositive_match.end():].strip()
        boilerplate = re.search(
            r'Рішення\s+(?:може бути оскаржене|суду\s+набирає\s+законної\s+сили)',
            dispositive, re.IGNORECASE
        )
        if boilerplate:
            dispositive = dispositive[:boilerplate.start()].strip()

    return {"facts": facts, "dispositive": dispositive}


def classify_outcome(dispositive):
    if not dispositive:
        return None
    if OUTCOME_PARTIAL.search(dispositive):
        return "partial"
    if OUTCOME_GRANTED.search(dispositive):
        return "approved"
    if OUTCOME_DENIED.search(dispositive):
        return "dismissed"
    return None


def clean_text(text):
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'ОСОБА_\d+', '[PERSON]', text)
    text = re.sub(r'АДРЕСА_\d+', '[ADDRESS]', text)
    text = re.sub(r'НОМЕР_\d+', '[NUMBER]', text)
    text = re.sub(r'ІНФОРМАЦІЯ_\d+', '[INFO]', text)
    return text.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true",
                        help="Connect to prod DB via SSH tunnel (port 5438). "
                             "Set PGPASSWORD env var or pass --password")
    parser.add_argument("--password", default=None,
                        help="DB password (overrides PGPASSWORD env var)")
    parser.add_argument("--target-per-class", type=int, default=None,
                        help="Target per class per epoch (default: use all)")
    parser.add_argument("--epochs", nargs="+", default=list(EPOCHS.keys()),
                        choices=list(EPOCHS.keys()),
                        help="Which epochs to extract (default: all)")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    random.seed(args.seed)

    if args.prod:
        db_config = DB_PROD.copy()
        if args.password:
            db_config["password"] = args.password
        if not db_config["password"]:
            print("ERROR: Set PGPASSWORD env var or use --password for prod DB")
            sys.exit(1)
        print("Connecting to PROD DB (127.0.0.1:5438 via SSH tunnel)")
    else:
        db_config = DB_LOCAL.copy()
        print("Connecting to LOCAL DB (localhost:5432)")

    conn = psycopg2.connect(**db_config)
    conn.set_client_encoding('UTF8')
    conn.set_session(readonly=True)

    with conn.cursor() as cur:
        cur.execute("SET idle_in_transaction_session_timeout = 0")
        cur.execute("SELECT current_database(), count(*) FROM edrsr_documents LIMIT 1")
        db_name, _ = cur.fetchone()
        print(f"Connected to: {db_name}")

    print(f"Epochs: {args.epochs}")
    if args.target_per_class:
        print(f"Target per class per epoch: {args.target_per_class}")

    all_results = []

    for epoch_name in args.epochs:
        epoch_cfg = EPOCHS[epoch_name]
        epoch_results = []

        for jk, jk_name in [(1, "civil"), (3, "commercial")]:
            print(f"\n  {epoch_name} / {jk_name} (justice_kind={jk}):")

            cursor_name = f"lx_{epoch_name}_{jk_name}"
            with conn.cursor(name=cursor_name,
                             cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.itersize = BATCH_SIZE
                # text_length is NULL in many partitions, so filter by length() in Python
                cur.execute("""
                    SELECT d.doc_id,
                           d.adjudication_date::text as adj_date,
                           f.full_text
                    FROM edrsr_documents d
                    JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
                        AND f.adj_year = EXTRACT(YEAR FROM d.adjudication_date)::int
                    WHERE d.judgment_code = 3
                      AND d.justice_kind = %s
                      AND d.adjudication_date >= %s
                      AND d.adjudication_date < %s
                    ORDER BY d.adjudication_date
                """, (jk, epoch_cfg["start"], epoch_cfg["end"]))

                processed = 0
                valid = 0
                skipped = Counter()

                for row in cur:
                    processed += 1
                    text = row["full_text"]

                    if not text or len(text) < 500 or len(text) > 200000:
                        skipped["text_length"] += 1
                        continue

                    sections = extract_sections(text)
                    if not sections["facts"] or len(sections["facts"]) < 200:
                        skipped["no_facts"] += 1
                        continue
                    if not sections["dispositive"] or len(sections["dispositive"]) < 50:
                        skipped["no_dispositive"] += 1
                        continue

                    outcome = classify_outcome(sections["dispositive"])
                    if not outcome:
                        skipped["no_outcome"] += 1
                        continue

                    facts = sections["facts"]

                    valid += 1
                    epoch_results.append({
                        "text": clean_text(facts),
                        "label": outcome,
                        "language": "uk",
                        "jurisdiction": jk_name,
                        "adjudication_date": row["adj_date"][:10] if row["adj_date"] else None,
                        "doc_id": str(row["doc_id"]),
                    })

                    if processed % 50000 == 0:
                        print(f"    ... {processed:,} processed, {valid:,} valid", flush=True)

            dist = Counter(r["label"] for r in epoch_results if r["jurisdiction"] == jk_name)
            print(f"    Done: {processed:,} processed, {valid:,} valid  {dict(dist)}")
            print(f"    Skipped: {dict(skipped)}")

        dist = Counter(r["label"] for r in epoch_results)
        print(f"\n  {epoch_name} total: {len(epoch_results):,} samples")
        print(f"  Distribution: {dict(dist)}")

        if args.target_per_class:
            by_label = {}
            for item in epoch_results:
                by_label.setdefault(item["label"], []).append(item)

            balanced = []
            for label in sorted(by_label.keys()):
                items = by_label[label]
                random.shuffle(items)
                n = min(len(items), args.target_per_class)
                balanced.extend(items[:n])
                print(f"    {label}: {n:,} of {len(items):,} sampled")

            epoch_results = balanced

        all_results.extend([(epoch_name, r) for r in epoch_results])

    conn.close()

    print(f"\n{'='*50}")
    print(f"Total extracted: {len(all_results):,} samples")
    for epoch_name in args.epochs:
        epoch_items = [r for e, r in all_results if e == epoch_name]
        dist = Counter(r["label"] for r in epoch_items)
        print(f"  {epoch_name}: {len(epoch_items):,}  {dict(dist)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for epoch_name in args.epochs:
        epoch_items = [r for e, r in all_results if e == epoch_name]
        epoch_items.sort(key=lambda r: r["adjudication_date"] or "")

        path = OUTPUT_DIR / f"lextreme-ukr-{epoch_name}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for item in epoch_items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        print(f"  {epoch_name}: {len(epoch_items):,} -> {path}")

    print("\nDone! Run build-temporal-splits.py next.")


if __name__ == "__main__":
    main()
