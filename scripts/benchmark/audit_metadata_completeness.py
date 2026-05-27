#!/usr/bin/env python3
"""
Audit metadata completeness across all court decision tables.

Produces a completeness matrix showing which benchmark-relevant fields
are populated per jurisdiction. Used to decide which jurisdictions
can join the cross-jurisdiction benchmark.

5 benchmark tasks require:
  1. court_type classification (CTC)
  2. decision_type classification
  3. subject_area classification
  4. outcome prediction
  5. cited_provisions extraction

Threshold: jurisdiction needs >= 2 tasks with structured metadata + >50K fulltext.

Usage:
  python3 scripts/benchmark/audit_metadata_completeness.py [--db-url URL] [--csv output.csv]
"""

import argparse
import csv
import json
import os
import sys

import psycopg2

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local",
)

JURISDICTIONS = {
    "ua": {
        "label": "Ukraine",
        "language_family": "Slavic",
        "query": """
            SELECT
                (SELECT count(*) FROM edrsr_documents) AS total,
                (SELECT count(*) FROM edrsr_fulltext WHERE text_length > 500) AS has_fulltext,
                (SELECT count(*) FROM edrsr_documents WHERE justice_kind IS NOT NULL) AS has_court_type,
                (SELECT count(*) FROM edrsr_documents WHERE judgment_code IS NOT NULL) AS has_decision_type,
                (SELECT count(*) FROM edrsr_documents WHERE category_code IS NOT NULL) AS has_subject,
                0::bigint AS has_outcome,
                0::bigint AS has_cited_provisions
        """,
        "notes": "outcome extracted via regex in lextreme pipeline; category_code = subject proxy",
    },
    "pl": {
        "label": "Poland",
        "language_family": "Slavic",
        "table": "pl_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": "keywords",
            "outcome": None,
            "cited_provisions": "legal_bases",
        },
    },
    "cz": {
        "label": "Czech Republic",
        "language_family": "Slavic",
        "table": "cz_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": "subject",
            "outcome": None,
            "cited_provisions": "cited_provisions",
        },
    },
    "hu": {
        "label": "Hungary",
        "language_family": "Uralic",
        "table": "hu_court_decisions",
        "columns": {
            "court_type": "collegium",
            "decision_type": "decision_type",
            "subject": "legal_area",
            "outcome": None,
            "cited_provisions": "legislation_refs",
        },
    },
    "lt": {
        "label": "Lithuania",
        "language_family": "Baltic",
        "table": "lt_court_decisions",
        "columns": {
            "court_type": "instance",
            "decision_type": "case_type",
            "subject": "categories",
            "outcome": "result",
            "cited_provisions": "eu_norms",
        },
    },
    "lv": {
        "label": "Latvia",
        "language_family": "Baltic",
        "table": "lv_court_decisions",
        "columns": {
            "court_type": "case_type",
            "decision_type": None,
            "subject": None,
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "ee": {
        "label": "Estonia",
        "language_family": "Uralic",
        "table": "ee_court_decisions",
        "columns": {
            "court_type": "case_type",
            "decision_type": "decision_type",
            "subject": None,
            "outcome": "outcome",
            "cited_provisions": None,
        },
    },
    "dk": {
        "label": "Denmark",
        "language_family": "Germanic",
        "table": "dk_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "case_type",
            "subject": None,
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "se": {
        "label": "Sweden",
        "language_family": "Germanic",
        "table": "se_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": "subject",
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "fi": {
        "label": "Finland",
        "language_family": "Uralic",
        "table": "fi_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": "subject",
            "outcome": None,
            "cited_provisions": "cited_provisions",
        },
    },
    "is": {
        "label": "Iceland",
        "language_family": "Germanic",
        "table": "is_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": "subject",
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "fr": {
        "label": "France",
        "language_family": "Romance",
        "table": "fr_court_decisions",
        "columns": {
            "court_type": "jurisdiction",
            "decision_type": "decision_type",
            "subject": "themes",
            "outcome": "solution",
            "cited_provisions": None,
        },
        "notes": "zones JSONB may contain citation data",
    },
    "de": {
        "label": "Germany",
        "language_family": "Germanic",
        "table": "de_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": "subject_area",
            "outcome": "tenor",
            "cited_provisions": None,
        },
        "notes": "tenor is raw text, not a label -- needs classification",
    },
    "be": {
        "label": "Belgium",
        "language_family": "Romance/Germanic",
        "table": "be_court_decisions",
        "columns": {
            "court_type": "court_name",
            "decision_type": "decision_type",
            "subject": None,
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "uk": {
        "label": "United Kingdom",
        "language_family": "Germanic",
        "table": "uk_court_decisions",
        "columns": {
            "court_type": "court_code",
            "decision_type": "decision_type",
            "subject": "subject",
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "ie": {
        "label": "Ireland",
        "language_family": "Germanic",
        "table": "ie_court_decisions",
        "columns": {
            "court_type": "court_type",
            "decision_type": "decision_type",
            "subject": None,
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "ch": {
        "label": "Switzerland",
        "language_family": "Romance/Germanic",
        "table": "ch_court_decisions",
        "columns": {
            "court_type": "court_code",
            "decision_type": "decision_type",
            "subject": None,
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "lu": {
        "label": "Luxembourg",
        "language_family": "Romance/Germanic",
        "table": "lu_court_decisions",
        "columns": {
            "court_type": "court",
            "decision_type": None,
            "subject": None,
            "outcome": None,
            "cited_provisions": None,
        },
    },
    "sg": {
        "label": "Singapore",
        "language_family": "Austronesian/Germanic",
        "table": "sg_court_decisions",
        "columns": {
            "court_type": "court_code",
            "decision_type": "decision_type",
            "subject": "subject",
            "outcome": None,
            "cited_provisions": None,
        },
    },
}


def count_field(cur, table, column):
    if column is None:
        return 0
    cur.execute(
        f"SELECT count(*) FROM {table} WHERE {column} IS NOT NULL AND {column}::text != '' AND {column}::text != '{{}}'"
    )
    return cur.fetchone()[0]


def count_fulltext(cur, table):
    cur.execute(
        f"SELECT count(*) FROM {table} WHERE full_text IS NOT NULL AND length(full_text) > 500"
    )
    return cur.fetchone()[0]


def count_total(cur, table):
    cur.execute(f"SELECT count(*) FROM {table}")
    return cur.fetchone()[0]


def audit_jurisdiction(cur, code, config):
    if "query" in config:
        cur.execute(config["query"])
        row = cur.fetchone()
        return {
            "code": code,
            "label": config["label"],
            "language_family": config["language_family"],
            "total": row[0],
            "fulltext": row[1],
            "court_type": row[2],
            "decision_type": row[3],
            "subject": row[4],
            "outcome": row[5],
            "cited_provisions": row[6],
            "notes": config.get("notes", ""),
        }

    table = config["table"]
    cols = config["columns"]

    try:
        total = count_total(cur, table)
    except psycopg2.errors.UndefinedTable:
        cur.connection.rollback()
        return {
            "code": code,
            "label": config["label"],
            "language_family": config["language_family"],
            "total": 0,
            "fulltext": 0,
            "court_type": 0,
            "decision_type": 0,
            "subject": 0,
            "outcome": 0,
            "cited_provisions": 0,
            "notes": "TABLE NOT FOUND",
        }

    fulltext = count_fulltext(cur, table)

    return {
        "code": code,
        "label": config["label"],
        "language_family": config["language_family"],
        "total": total,
        "fulltext": fulltext,
        "court_type": count_field(cur, table, cols["court_type"]),
        "decision_type": count_field(cur, table, cols["decision_type"]),
        "subject": count_field(cur, table, cols["subject"]),
        "outcome": count_field(cur, table, cols["outcome"]),
        "cited_provisions": count_field(cur, table, cols["cited_provisions"]),
        "notes": config.get("notes", ""),
    }


def pct(n, total):
    if total == 0:
        return "0%"
    p = n / total * 100
    if p >= 99.5:
        return "100%"
    if p < 0.05:
        return "0%"
    return f"{p:.0f}%"


def task_count(row):
    tasks = 0
    total = row["total"]
    if total == 0:
        return 0
    threshold = 0.05
    for field in ["court_type", "decision_type", "subject", "outcome", "cited_provisions"]:
        if row[field] / total >= threshold:
            tasks += 1
    return tasks


def print_matrix(results):
    header = f"{'Code':<4} {'Country':<16} {'Family':<12} {'Total':>10} {'Fulltext':>10} {'CourtType':>10} {'DecType':>10} {'Subject':>10} {'Outcome':>10} {'CitedProv':>10} {'Tasks':>5} {'Benchmark':>9}"
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)

    for r in sorted(results, key=lambda x: (-task_count(x), -x["fulltext"])):
        tasks = task_count(r)
        benchmark = "YES" if tasks >= 2 and r["fulltext"] >= 50000 else "no"
        print(
            f"{r['code']:<4} {r['label']:<16} {r['language_family']:<12} "
            f"{r['total']:>10,} {r['fulltext']:>10,} "
            f"{pct(r['court_type'], r['total']):>10} "
            f"{pct(r['decision_type'], r['total']):>10} "
            f"{pct(r['subject'], r['total']):>10} "
            f"{pct(r['outcome'], r['total']):>10} "
            f"{pct(r['cited_provisions'], r['total']):>10} "
            f"{tasks:>5} {benchmark:>9}"
        )
        if r.get("notes"):
            print(f"     ^ {r['notes']}")

    print(sep)
    qualified = [r for r in results if task_count(r) >= 2 and r["fulltext"] >= 50000]
    print(f"\nQualified for benchmark (>=2 tasks, >=50K fulltext): {len(qualified)}")
    for r in qualified:
        print(f"  {r['code'].upper()} ({r['label']}) -- {task_count(r)} tasks, {r['fulltext']:,} fulltext")


def main():
    parser = argparse.ArgumentParser(description="Audit metadata completeness across court decision tables")
    parser.add_argument("--db-url", default=DB_URL, help="PostgreSQL connection URL")
    parser.add_argument("--csv", default=None, help="Output CSV file path")
    parser.add_argument("--json", default=None, help="Output JSON file path")
    args = parser.parse_args()

    conn = psycopg2.connect(args.db_url)
    conn.autocommit = True
    cur = conn.cursor()

    results = []
    for code, config in JURISDICTIONS.items():
        print(f"  Auditing {code} ({config['label']})...", end=" ", flush=True)
        row = audit_jurisdiction(cur, code, config)
        results.append(row)
        tasks = task_count(row)
        print(f"{row['total']:,} total, {row['fulltext']:,} fulltext, {tasks}/5 tasks")

    print("\n")
    print_matrix(results)

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "code", "label", "language_family", "total", "fulltext",
                "court_type", "decision_type", "subject", "outcome",
                "cited_provisions", "notes",
            ])
            writer.writeheader()
            writer.writerows(results)
        print(f"\nCSV written to {args.csv}")

    if args.json:
        with open(args.json, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nJSON written to {args.json}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
