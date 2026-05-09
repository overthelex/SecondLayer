"""
Export workflow_edits from rlhf-signals DB to DPO-ready JSONL format.

DPO format: {"prompt": "...", "chosen": "...", "rejected": "..."}
  - prompt  = context that produced the LLM output (from session/artifact metadata)
  - chosen  = practitioner's edited version (to_artifact content)
  - rejected = original LLM output (from_artifact content)

Usage:
  cd rlhf-signals
  python training/export_dpo_pairs.py [--output training/data/] [--max-tokens 4096]
"""

import json
import os
import sys
from pathlib import Path
from collections import Counter

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://secondlayer@localhost:5432/lex_rlhf_signals")

OUTPUT_DIR = Path(__file__).resolve().parent / "data"

INCLUDE_CLASSES = [
    "substantive_rewrite",
    "rejection",
    "reorganization",
    "factual_correction",
]

MAX_COMBINED_CHARS = 16_000  # ~4096 tokens at ~4 chars/token
MIN_CONTENT_CHARS = 20
TRAIN_SPLIT = 0.9
SEED = 42


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def fetch_dpo_pairs(conn) -> list[dict]:
    """
    Fetch edit pairs with full artifact content.

    Join: workflow_edits → from_artifact (rejected) + to_artifact (chosen)
    Also get session context for prompt reconstruction.
    """
    query = """
    SELECT
        e.edit_id,
        e.session_id,
        e.semantic_change_class,
        e.edit_distance_norm,
        s.source AS session_source,
        s.external_ref,
        s.surface_tags,
        -- from_artifact = original LLM output (rejected)
        fa.content_raw AS rejected_content,
        fa.role AS from_role,
        fa.token_count AS rejected_tokens,
        -- to_artifact = practitioner edit (chosen)
        ta.content_raw AS chosen_content,
        ta.role AS to_role,
        ta.token_count AS chosen_tokens,
        -- get the prompt artifact (sequence_index 0 or role='prompt')
        pa.content_raw AS prompt_content
    FROM workflow_edits e
    JOIN workflow_artifacts fa ON e.from_artifact_id = fa.artifact_id
    JOIN workflow_artifacts ta ON e.to_artifact_id = ta.artifact_id
    JOIN workflow_sessions s ON e.session_id = s.session_id
    LEFT JOIN workflow_artifacts pa ON (
        pa.session_id = e.session_id
        AND pa.role = 'prompt'
        AND pa.sequence_index = (
            SELECT MAX(p2.sequence_index)
            FROM workflow_artifacts p2
            WHERE p2.session_id = e.session_id
              AND p2.role = 'prompt'
              AND p2.sequence_index < fa.sequence_index
        )
    )
    WHERE e.semantic_change_class IN %s
      AND fa.content_raw IS NOT NULL
      AND ta.content_raw IS NOT NULL
      AND LENGTH(fa.content_raw) >= %s
      AND LENGTH(ta.content_raw) >= %s
    ORDER BY s.created_at, fa.sequence_index
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, (tuple(INCLUDE_CLASSES), MIN_CONTENT_CHARS, MIN_CONTENT_CHARS))
        return cur.fetchall()


def build_prompt(row: dict) -> str:
    """Reconstruct prompt from available context."""
    if row["prompt_content"]:
        return row["prompt_content"]

    source = row["session_source"]
    ref = row["external_ref"] or ""

    if source == "claude_code_transcript":
        return f"[Claude Code session] Task context from transcript {ref}"
    elif source == "github_pr":
        return f"[GitHub PR] Review and improve the following code change from {ref}"
    elif source == "plane_issue":
        return f"[Task] Complete the following task: {ref}"
    else:
        return f"[{source}] {ref}"


def format_dpo_pair(row: dict) -> dict | None:
    """Convert a DB row to DPO format, with validation."""
    prompt = build_prompt(row)
    chosen = row["chosen_content"]
    rejected = row["rejected_content"]

    combined_len = len(prompt) + len(chosen) + len(rejected)
    if combined_len > MAX_COMBINED_CHARS:
        return None

    if chosen.strip() == rejected.strip():
        return None

    return {
        "prompt": prompt,
        "chosen": chosen,
        "rejected": rejected,
        "metadata": {
            "edit_id": row["edit_id"],
            "session_id": row["session_id"],
            "semantic_class": row["semantic_change_class"],
            "edit_distance_norm": float(row["edit_distance_norm"]) if row["edit_distance_norm"] else None,
            "source": row["session_source"],
        },
    }


def main():
    import argparse
    import random

    parser = argparse.ArgumentParser(description="Export DPO pairs from rlhf-signals DB")
    parser.add_argument("--output", type=str, default=str(OUTPUT_DIR))
    parser.add_argument("--max-tokens", type=int, default=4096)
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    global MAX_COMBINED_CHARS
    MAX_COMBINED_CHARS = args.max_tokens * 4

    print(f"Connecting to DB: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    conn = get_connection()

    print(f"Fetching edit pairs (classes: {INCLUDE_CLASSES})...")
    rows = fetch_dpo_pairs(conn)
    print(f"  Raw rows fetched: {len(rows)}")

    pairs = []
    skipped_length = 0
    skipped_identical = 0

    for row in rows:
        result = format_dpo_pair(row)
        if result is None:
            if row["chosen_content"].strip() == row["rejected_content"].strip():
                skipped_identical += 1
            else:
                skipped_length += 1
        else:
            pairs.append(result)

    print(f"  Valid DPO pairs: {len(pairs)}")
    print(f"  Skipped (too long): {skipped_length}")
    print(f"  Skipped (identical): {skipped_identical}")

    # Stats
    class_counts = Counter(p["metadata"]["semantic_class"] for p in pairs)
    print(f"\n  Class distribution:")
    for cls, count in class_counts.most_common():
        print(f"    {cls}: {count} ({100*count/len(pairs):.1f}%)")

    prompt_lens = [len(p["prompt"]) for p in pairs]
    chosen_lens = [len(p["chosen"]) for p in pairs]
    rejected_lens = [len(p["rejected"]) for p in pairs]
    print(f"\n  Char lengths (median):")
    print(f"    prompt:   {sorted(prompt_lens)[len(prompt_lens)//2]}")
    print(f"    chosen:   {sorted(chosen_lens)[len(chosen_lens)//2]}")
    print(f"    rejected: {sorted(rejected_lens)[len(rejected_lens)//2]}")

    # Shuffle and split
    random.seed(SEED)
    random.shuffle(pairs)

    split_idx = int(len(pairs) * TRAIN_SPLIT)
    train_pairs = pairs[:split_idx]
    val_pairs = pairs[split_idx:]

    print(f"\n  Train: {len(train_pairs)}, Val: {len(val_pairs)}")

    # Write JSONL
    train_path = output_dir / "train.jsonl"
    val_path = output_dir / "val.jsonl"

    for path, data in [(train_path, train_pairs), (val_path, val_pairs)]:
        with open(path, "w", encoding="utf-8") as f:
            for pair in data:
                # Write without metadata for training (TRL expects prompt/chosen/rejected)
                training_record = {
                    "prompt": pair["prompt"],
                    "chosen": pair["chosen"],
                    "rejected": pair["rejected"],
                }
                f.write(json.dumps(training_record, ensure_ascii=False) + "\n")
        print(f"  Written: {path} ({len(data)} records)")

    # Also write full version with metadata for analysis
    full_path = output_dir / "full_with_metadata.jsonl"
    with open(full_path, "w", encoding="utf-8") as f:
        for pair in pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")
    print(f"  Written: {full_path} ({len(pairs)} records)")

    # Summary stats file
    stats_path = output_dir / "export_stats.json"
    stats = {
        "total_pairs": len(pairs),
        "train_pairs": len(train_pairs),
        "val_pairs": len(val_pairs),
        "skipped_length": skipped_length,
        "skipped_identical": skipped_identical,
        "class_distribution": dict(class_counts),
        "include_classes": INCLUDE_CLASSES,
        "max_combined_chars": MAX_COMBINED_CHARS,
        "seed": SEED,
        "train_split": TRAIN_SPLIT,
    }
    with open(stats_path, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"  Written: {stats_path}")

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
