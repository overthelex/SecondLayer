#!/usr/bin/env python3
"""
Convert JSONL dataset to HuggingFace-ready parquet with train/val/test splits.
"""

import json
import os
import random
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

INPUT = os.path.join(os.path.dirname(__file__), "ua_case_outcome_v5.jsonl")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "ua-case-outcome-hf")

JUSTICE_KIND_NAMES = {
    1: "civil",
    2: "criminal",
    3: "commercial",
    4: "administrative",
    5: "admin_offense",
}

SEED = 42
TRAIN_RATIO = 0.8
VAL_RATIO = 0.1
TEST_RATIO = 0.1


def main():
    random.seed(SEED)

    records = []
    with open(INPUT, "r", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            r["justice_kind_name"] = JUSTICE_KIND_NAMES.get(r["justice_kind"], "unknown")
            records.append(r)

    random.shuffle(records)

    n = len(records)
    train_end = int(n * TRAIN_RATIO)
    val_end = train_end + int(n * VAL_RATIO)

    splits = {
        "train": records[:train_end],
        "validation": records[train_end:val_end],
        "test": records[val_end:],
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    schema = pa.schema([
        ("doc_id", pa.int64()),
        ("justice_kind", pa.int8()),
        ("justice_kind_name", pa.string()),
        ("judgment_code", pa.int8()),
        ("category_code", pa.int32()),
        ("court_code", pa.int32()),
        ("judge", pa.string()),
        ("adjudication_date", pa.string()),
        ("facts", pa.string()),
        ("dispositive", pa.string()),
        ("outcome", pa.string()),
        ("epoch", pa.string()),
        ("year", pa.int16()),
        ("full_text_length", pa.int32()),
    ])

    for split_name, split_data in splits.items():
        df = pd.DataFrame(split_data)
        table = pa.Table.from_pandas(df, schema=schema, preserve_index=False)
        out_path = os.path.join(OUTPUT_DIR, f"{split_name}.parquet")
        pq.write_table(table, out_path, compression="zstd")
        print(f"{split_name}: {len(split_data)} records -> {out_path}")

        # Outcome distribution
        from collections import Counter
        dist = Counter(r["outcome"] for r in split_data)
        for outcome, cnt in dist.most_common():
            print(f"  {outcome}: {cnt}")

    print(f"\nTotal: {n} records")
    print(f"Output: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
