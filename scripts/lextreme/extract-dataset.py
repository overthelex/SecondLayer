#!/usr/bin/env python3
"""
Extract Ukrainian court decisions for LexTreme dataset contribution.

Extracts the facts section (ВСТАНОВИВ/УСТАНОВИВ) from court decisions,
classifies outcomes, and produces train/val/test splits in parquet format.

Focus: "Рішення" (judgment_code=3) in civil (1) and commercial (3) proceedings.
These have clear allowed/denied/partial outcomes — ideal for case outcome prediction.

Usage:
    python3 scripts/lextreme/extract-dataset.py                  # full extraction
    python3 scripts/lextreme/extract-dataset.py --sample 1000    # test with small sample
    python3 scripts/lextreme/extract-dataset.py --stats          # just show stats
"""

import argparse
import json
import os
import random
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
CONTAINER = "secondlayer-postgres-prod"
PGUSER = "secondlayer"
PGDB = "secondlayer_prod"

# --- Section extraction ---

FACTS_RE = re.compile(
    r'[ВУ]\s*[СС]\s*Т\s*А\s*Н\s*О\s*В\s*И\s*В\s*:',
    re.IGNORECASE
)
DISP_RE = re.compile(
    r'(?:В\s*И\s*Р\s*І\s*Ш\s*И\s*В|У\s*Х\s*В\s*А\s*Л\s*И\s*В|П\s*О\s*С\s*Т\s*А\s*Н\s*О\s*В\s*И\s*В)\s*:',
    re.IGNORECASE
)

JUSTICE_KINDS = {1: "civil", 3: "commercial"}
JUSTICE_LABELS = {1: "Цивільне", 3: "Господарське"}


def normalize_text(text: str) -> str:
    """Collapse spaced-out characters common in formatted court decisions."""
    return re.sub(r'\s+', ' ', text)


def extract_facts(full_text: str) -> str | None:
    """Extract the facts section between ВСТАНОВИВ and ВИРІШИВ markers."""
    text_norm = normalize_text(full_text)
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


def extract_outcome(full_text: str) -> str | None:
    """Extract outcome label from the dispositive section."""
    text_norm = normalize_text(full_text)
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


def prod_psql(sql: str, timeout: int = 600) -> str:
    """Execute SQL on prod via SSH + docker exec."""
    flat_sql = " ".join(sql.strip().split())
    shell_cmd = f"docker exec {CONTAINER} psql -U {PGUSER} -d {PGDB} -t -A -c \"{flat_sql}\""
    cmd = ["ssh", "prod", shell_cmd]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        print(f"Error: {r.stderr}", file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


def get_stats():
    """Show statistics about available data."""
    print("📊 Збір статистики про дані ЄДРСР...")

    for jk, name in JUSTICE_LABELS.items():
        result = prod_psql(f"""
            SELECT COUNT(*) FROM edrsr_documents d
            JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
            WHERE d.judgment_code = 3
              AND d.justice_kind = {jk}
              AND f.text_length > 500
        """)
        print(f"  {name} рішення з повним текстом (>500 chars): {int(result):,}")

    total = prod_psql("""
        SELECT COUNT(*) FROM edrsr_documents d
        JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
        WHERE d.judgment_code = 3
          AND d.justice_kind IN (1, 3)
          AND f.text_length > 500
    """)
    print(f"\n  Разом: {int(total):,}")


def extract_batch(justice_kind: int, limit: int | None, offset: int = 0) -> list[dict]:
    """Extract a batch of decisions from prod DB."""
    limit_clause = f"LIMIT {limit}" if limit else ""

    # We use TABLESAMPLE for large extractions to avoid sequential scan
    query = f"""
        SELECT d.doc_id, d.cause_num, d.court_code,
               d.adjudication_date::date as adj_date,
               d.category_code,
               f.full_text
        FROM edrsr_documents d
        JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
        WHERE d.judgment_code = 3
          AND d.justice_kind = {justice_kind}
          AND f.text_length > 500
          AND f.text_length < 200000
        ORDER BY d.doc_id
        OFFSET {offset}
        {limit_clause}
    """

    print(f"  Завантаження {'цивільних' if justice_kind == 1 else 'господарських'} рішень...")
    raw = prod_psql(query, timeout=1200)

    rows = []
    for line in raw.split("\n"):
        if not line:
            continue
        parts = line.split("|", 5)
        if len(parts) < 6:
            continue
        rows.append({
            "doc_id": parts[0],
            "cause_num": parts[1],
            "court_code": parts[2],
            "adj_date": parts[3],
            "category_code": parts[4],
            "full_text": parts[5],
        })

    return rows


def process_rows(rows: list[dict], justice_kind: int) -> list[dict]:
    """Process raw rows: extract facts, classify outcome."""
    results = []
    skipped = Counter()

    for row in rows:
        text = row["full_text"]

        facts = extract_facts(text)
        if not facts:
            skipped["no_facts"] += 1
            continue

        outcome = extract_outcome(text)
        if not outcome:
            skipped["no_outcome"] += 1
            continue

        # Truncate very long facts to 10K chars (keeps it manageable)
        if len(facts) > 10000:
            facts = facts[:10000]

        results.append({
            "text": facts,
            "label": outcome,
            "language": "uk",
            "justice_kind": JUSTICE_KINDS[justice_kind],
            "doc_id": row["doc_id"],
            "adjudication_date": row["adj_date"],
        })

    if skipped:
        print(f"    Пропущено: {dict(skipped)}")

    return results


def balanced_sample(data: list[dict], target_per_class: int) -> list[dict]:
    """Create a balanced sample with equal representation per class."""
    by_label = {}
    for item in data:
        by_label.setdefault(item["label"], []).append(item)

    print(f"  Розподіл до балансування:")
    for label, items in sorted(by_label.items()):
        print(f"    {label}: {len(items):,}")

    sampled = []
    for label, items in by_label.items():
        random.shuffle(items)
        sampled.extend(items[:target_per_class])

    random.shuffle(sampled)
    return sampled


def split_data(data: list[dict], train_ratio=0.8, val_ratio=0.1):
    """Split into train/validation/test."""
    random.shuffle(data)
    n = len(data)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    return {
        "train": data[:train_end],
        "validation": data[train_end:val_end],
        "test": data[val_end:],
    }


def save_parquet(splits: dict, output_dir: Path):
    """Save splits as parquet files."""
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError:
        print("❌ pyarrow не встановлено. Встановіть: pip install pyarrow")
        print("   Зберігаю у JSONL замість parquet...")
        save_jsonl(splits, output_dir)
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    for split_name, items in splits.items():
        # For HuggingFace: only text, label, language columns
        texts = [item["text"] for item in items]
        labels = [item["label"] for item in items]
        languages = [item["language"] for item in items]

        table = pa.table({
            "text": pa.array(texts, type=pa.string()),
            "label": pa.array(labels, type=pa.string()),
            "language": pa.array(languages, type=pa.string()),
        })

        path = output_dir / f"{split_name}.parquet"
        pq.write_table(table, path, compression="snappy")
        print(f"  ✅ {split_name}: {len(items):,} записів → {path}")

    # Also save full metadata version as JSONL for reference
    meta_dir = output_dir / "with_metadata"
    meta_dir.mkdir(exist_ok=True)
    for split_name, items in splits.items():
        path = meta_dir / f"{split_name}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")


def save_jsonl(splits: dict, output_dir: Path):
    """Fallback: save as JSONL."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for split_name, items in splits.items():
        path = output_dir / f"{split_name}.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            for item in items:
                row = {"text": item["text"], "label": item["label"], "language": item["language"]}
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"  ✅ {split_name}: {len(items):,} записів → {path}")


def main():
    parser = argparse.ArgumentParser(description="Extract Ukrainian court decisions for LexTreme")
    parser.add_argument("--sample", type=int, default=None,
                        help="Sample size per justice kind (default: extract all, then balance)")
    parser.add_argument("--target-per-class", type=int, default=5000,
                        help="Target examples per outcome class after balancing (default: 5000)")
    parser.add_argument("--stats", action="store_true", help="Only show statistics")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)

    if args.stats:
        get_stats()
        return

    print("🇺🇦 Підготовка датасету українських судових рішень для LexTreme")
    print(f"   Ціль: {args.target_per_class} зразків на клас (approved/dismissed/partial)")
    print()

    all_results = []

    for jk in [1, 3]:
        print(f"\n📋 {JUSTICE_LABELS[jk]} судочинство (justice_kind={jk}):")

        batch_size = args.sample or 30000
        rows = extract_batch(jk, limit=batch_size)
        print(f"  Завантажено: {len(rows):,} рішень")

        results = process_rows(rows, jk)
        print(f"  Оброблено: {len(results):,} валідних зразків")
        all_results.extend(results)

    print(f"\n📊 Разом зібрано: {len(all_results):,} зразків")

    # Balance classes
    balanced = balanced_sample(all_results, args.target_per_class)
    print(f"\n⚖️  Після балансування: {len(balanced):,} зразків")

    # Show final distribution
    final_dist = Counter(item["label"] for item in balanced)
    for label, count in sorted(final_dist.items()):
        print(f"  {label}: {count:,}")

    # Split into train/val/test
    splits = split_data(balanced)
    print(f"\n📂 Розбиття:")
    for name, items in splits.items():
        dist = Counter(item["label"] for item in items)
        print(f"  {name}: {len(items):,} ({dict(dist)})")

    # Save
    print(f"\n💾 Збереження...")
    save_parquet(splits, OUTPUT_DIR)

    print(f"\n✅ Готово! Файли збережено в {OUTPUT_DIR}/")
    print(f"   Наступний крок: завантажити на HuggingFace і створити PR до lextreme")


if __name__ == "__main__":
    main()
