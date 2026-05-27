#!/usr/bin/env python3
"""
Multi-jurisdiction LLM metadata enrichment via AWS Bedrock.

Generic pipeline for extracting structured metadata from court decision fulltext
using Claude Haiku across multiple AWS regions. Supports:
  - subject_area classification
  - outcome prediction
  - cited_provisions extraction

Architecture follows annotate_ner_parallel.py:
  - Multi-region Bedrock workers for throughput
  - DB-backed work queue with checkpoint/resume
  - Cost tracking per jurisdiction per task
  - Configurable per-jurisdiction: table, text column, target fields, labels, language

Usage:
  # Enrich German subject_area via LLM
  python3 scripts/benchmark/enrich_metadata_llm.py --country de --task subject_area

  # Enrich Swedish outcome via LLM
  python3 scripts/benchmark/enrich_metadata_llm.py --country se --task outcome

  # Enrich UK subject + outcome
  python3 scripts/benchmark/enrich_metadata_llm.py --country uk --task subject_area outcome

  # Dry run (count records, don't write)
  python3 scripts/benchmark/enrich_metadata_llm.py --country hu --task outcome --dry-run

  # Limit batch size
  python3 scripts/benchmark/enrich_metadata_llm.py --country de --task subject_area --limit 5000
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import boto3
import psycopg2
import psycopg2.extras

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local",
)

WORKERS = [
    {"region": "eu-central-1", "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "eu-west-1",    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "eu-west-2",    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "eu-west-3",    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "eu-north-1",   "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "us-east-1",    "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
    {"region": "us-west-2",    "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0"},
]

JURISDICTION_CONFIG = {
    "de": {
        "table": "de_court_decisions",
        "language": "German",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "subject_area": {
                "column": "enriched_subject_area",
                "categories": ["Zivilrecht", "Strafrecht", "Verwaltungsrecht", "Arbeitsrecht", "Sozialrecht", "Steuerrecht", "Verfassungsrecht", "Patentrecht"],
                "max_input_chars": 1500,
            },
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "hu": {
        "table": "hu_court_decisions",
        "language": "Hungarian",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "se": {
        "table": "se_court_decisions",
        "language": "Swedish",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "subject_area": {
                "column": "enriched_subject_area",
                "categories": ["civilrätt", "straffrätt", "förvaltningsrätt", "arbetsrätt", "skatteträtt", "miljörätt", "migrationsrätt", "socialrätt"],
                "max_input_chars": 1500,
            },
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "fi": {
        "table": "fi_court_decisions",
        "language": "Finnish",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
            "cited_provisions": {
                "column": "enriched_cited_provisions",
                "output_type": "json_array",
                "max_input_chars": 3000,
            },
        },
    },
    "uk": {
        "table": "uk_court_decisions",
        "language": "English",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "subject_area": {
                "column": "enriched_subject_area",
                "categories": ["criminal", "civil", "family", "administrative", "commercial", "employment", "immigration", "tax", "intellectual_property", "constitutional"],
                "max_input_chars": 1500,
            },
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "lv": {
        "table": "lv_court_decisions",
        "language": "Latvian",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "subject_area": {
                "column": "enriched_subject_area",
                "categories": ["civillieta", "krimināllieta", "administratīvā_lieta", "darba_lieta"],
                "max_input_chars": 1500,
            },
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "pl": {
        "table": "pl_court_decisions",
        "language": "Polish",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "cz": {
        "table": "cz_court_decisions",
        "language": "Czech",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
    "sg": {
        "table": "sg_court_decisions",
        "language": "English",
        "text_column": "full_text",
        "id_column": "id",
        "tasks": {
            "outcome": {
                "column": "enriched_outcome",
                "categories": ["granted", "denied", "partial"],
                "max_input_chars": 2000,
                "text_slice": "tail",
            },
        },
    },
}

PROMPTS = {
    "subject_area": """Classify the subject area of this {language} court decision. Return ONLY the category label, nothing else.

Categories: {categories}

Text (first {max_chars} chars):
{text}

Category:""",
    "outcome": """Classify the outcome of this {language} court decision. Read the dispositive/operative section and return ONLY one label, nothing else.

Labels: {categories}

(granted = claim accepted, plaintiff wins; denied = claim rejected; partial = partly accepted)

Text:
{text}

Label:""",
    "cited_provisions": """Extract all legal provisions (law articles, sections, acts) cited in this {language} court decision. Return ONLY a JSON array of strings. If none found, return [].

Text (first {max_chars} chars):
{text}

Provisions:""",
}

print_lock = Lock()


def log(msg):
    with print_lock:
        print(msg, flush=True)


def get_text_slice(text, task_config):
    max_chars = task_config.get("max_input_chars", 2000)
    if task_config.get("text_slice") == "tail":
        return text[-max_chars:]
    return text[:max_chars]


def build_prompt(text, task_name, task_config, language):
    template = PROMPTS[task_name]
    sliced = get_text_slice(text, task_config)
    categories = ", ".join(task_config.get("categories", []))
    return template.format(
        language=language,
        categories=categories,
        max_chars=task_config.get("max_input_chars", 2000),
        text=sliced,
    )


def parse_classification(response_text, valid_labels):
    answer = response_text.strip().lower().strip(".")
    for label in valid_labels:
        if label.lower() in answer:
            return label
    return None


def parse_json_array(response_text):
    text = response_text.strip()
    if text.startswith("```"):
        first_nl = text.index("\n") if "\n" in text else len(text)
        text = text[first_nl + 1:]
    if text.endswith("```"):
        text = text[:-3].strip()
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass
    return None


def ensure_column(conn, table, column, col_type="TEXT"):
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    """, (table, column))
    if not cur.fetchone():
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        conn.commit()
        log(f"  Added column {column} to {table}")
    cur.close()


def worker_loop(worker_id, region, model, work_items, table, id_column, task_name, task_config, language, dry_run):
    bedrock = boto3.client("bedrock-runtime", region_name=region)
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    column = task_config["column"]
    output_type = task_config.get("output_type", "classification")
    valid_labels = [l.lower() for l in task_config.get("categories", [])]

    done = 0
    errors = 0
    cost = 0.0
    t0 = time.time()

    for doc_id, text in work_items:
        prompt = build_prompt(text, task_name, task_config, language)

        try:
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 100 if output_type == "json_array" else 30,
                "temperature": 0,
                "messages": [{"role": "user", "content": prompt}],
            })

            resp = bedrock.invoke_model(
                modelId=model,
                contentType="application/json",
                accept="application/json",
                body=body,
            )

            result = json.loads(resp["body"].read())
            resp_text = result["content"][0]["text"]
            usage = result.get("usage", {})
            input_tok = usage.get("input_tokens", 0)
            output_tok = usage.get("output_tokens", 0)
            c = input_tok * 0.25 / 1e6 + output_tok * 1.25 / 1e6
            cost += c

            if output_type == "json_array":
                parsed = parse_json_array(resp_text)
                value = json.dumps(parsed, ensure_ascii=False) if parsed else None
            else:
                value = parse_classification(resp_text, task_config.get("categories", []))

            if value and not dry_run:
                if output_type == "json_array":
                    cur.execute(
                        f"UPDATE {table} SET {column} = %s WHERE {id_column} = %s",
                        (value, doc_id),
                    )
                else:
                    cur.execute(
                        f"UPDATE {table} SET {column} = %s WHERE {id_column} = %s",
                        (value, doc_id),
                    )
                done += 1
            elif value:
                done += 1
            else:
                errors += 1

        except Exception as e:
            errors += 1
            if errors <= 5:
                log(f"  [W{worker_id}] error: {type(e).__name__}: {str(e)[:80]}")
            time.sleep(1)
            continue

        if done > 0 and done % 100 == 0:
            elapsed = time.time() - t0
            rate = done / elapsed if elapsed > 0 else 0
            remaining = len(work_items) - done - errors
            eta = remaining / rate / 60 if rate > 0 else 0
            log(f"  [W{worker_id}] done={done}/{len(work_items)} err={errors} cost=${cost:.3f} rate={rate:.1f}/s ETA={eta:.0f}min region={region}")

    cur.close()
    conn.close()
    return {"worker": worker_id, "region": region, "done": done, "errors": errors, "cost": cost}


def main():
    parser = argparse.ArgumentParser(description="Multi-jurisdiction LLM metadata enrichment via Bedrock")
    parser.add_argument("--country", required=True, choices=list(JURISDICTION_CONFIG.keys()))
    parser.add_argument("--task", required=True, nargs="+", help="Tasks to run: subject_area, outcome, cited_provisions")
    parser.add_argument("--db-url", default=DB_URL)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Max records to process (0=all)")
    parser.add_argument("--workers", type=int, default=len(WORKERS), help="Number of parallel workers")
    args = parser.parse_args()

    global DB_URL
    DB_URL = args.db_url

    config = JURISDICTION_CONFIG[args.country]
    table = config["table"]
    language = config["language"]
    id_column = config["id_column"]
    text_column = config["text_column"]

    conn = psycopg2.connect(args.db_url)
    conn.autocommit = True

    for task_name in args.task:
        if task_name not in config["tasks"]:
            print(f"Task '{task_name}' not configured for {args.country}. Available: {list(config['tasks'].keys())}")
            sys.exit(1)

        task_config = config["tasks"][task_name]
        column = task_config["column"]

        if not args.dry_run:
            col_type = "TEXT[]" if task_config.get("output_type") == "json_array" else "TEXT"
            ensure_column(conn, table, column, col_type)

        cur = conn.cursor()
        cur.execute(f"SELECT count(*) FROM {table} WHERE {text_column} IS NOT NULL AND length({text_column}) > 500 AND {column} IS NULL")
        remaining = cur.fetchone()[0]
        cur.close()

        limit_clause = f"LIMIT {args.limit}" if args.limit > 0 else ""
        print(f"\n{'='*60}")
        print(f"  {args.country.upper()} / {task_name}: {remaining:,} records to enrich")
        print(f"  Table: {table}, Column: {column}")
        print(f"  Workers: {min(args.workers, len(WORKERS))}, Limit: {args.limit or 'all'}")
        print(f"{'='*60}")

        if remaining == 0:
            print("  Nothing to do.")
            continue

        cur = conn.cursor()
        cur.execute(f"""
            SELECT {id_column}, {text_column}
            FROM {table}
            WHERE {text_column} IS NOT NULL AND length({text_column}) > 500
              AND {column} IS NULL
            ORDER BY {id_column}
            {limit_clause}
        """)
        rows = cur.fetchall()
        cur.close()

        n_workers = min(args.workers, len(WORKERS), len(rows))
        chunk_size = len(rows) // n_workers
        chunks = []
        for i in range(n_workers):
            start = i * chunk_size
            end = start + chunk_size if i < n_workers - 1 else len(rows)
            chunks.append(rows[start:end])

        print(f"  Distributing {len(rows):,} records across {n_workers} workers...")

        t0 = time.time()
        with ThreadPoolExecutor(max_workers=n_workers) as executor:
            futures = {}
            for i, chunk in enumerate(chunks):
                worker = WORKERS[i % len(WORKERS)]
                f = executor.submit(
                    worker_loop,
                    i, worker["region"], worker["model"],
                    chunk, table, id_column,
                    task_name, task_config, language, args.dry_run,
                )
                futures[f] = i

            total_done = 0
            total_errors = 0
            total_cost = 0.0
            for f in as_completed(futures):
                result = f.result()
                total_done += result["done"]
                total_errors += result["errors"]
                total_cost += result["cost"]
                log(f"  Worker {result['worker']} finished: done={result['done']}, errors={result['errors']}, cost=${result['cost']:.3f}")

        elapsed = time.time() - t0
        print(f"\n  === {args.country.upper()} / {task_name} Summary ===")
        print(f"  Done: {total_done:,}, Errors: {total_errors:,}, Cost: ${total_cost:.2f}")
        print(f"  Time: {elapsed:.0f}s, Rate: {total_done/max(elapsed,1):.1f} records/s")
        if args.dry_run:
            print("  (dry-run mode)")

    conn.close()


if __name__ == "__main__":
    main()
