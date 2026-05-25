#!/usr/bin/env python3
"""Deduplication and quality analysis for PL and CZ court decisions — optimized."""

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2

DB_URL = os.environ.get("DATABASE_URL")


def q(sql: str, label: str = ""):
    """Run query, print result immediately."""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    t0 = time.time()
    cur.execute(sql)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    conn.close()
    elapsed = time.time() - t0
    if label:
        print(f"\n--- {label} ({elapsed:.1f}s) ---", flush=True)
    widths = [max(len(str(c)), *(len(str(r[i])) for r in rows)) for i, c in enumerate(cols)] if rows else []
    if rows:
        print("  " + " | ".join(str(c).ljust(w) for c, w in zip(cols, widths)), flush=True)
        print("  " + "-+-".join("-" * w for w in widths), flush=True)
        for r in rows:
            print("  " + " | ".join(str(v).ljust(w) for v, w in zip(r, widths)), flush=True)
    return rows


def main():
    print("=" * 70, flush=True)
    print("POLAND", flush=True)
    print("=" * 70, flush=True)

    q("""
        SELECT source, count(*) AS total,
               count(full_text) AS with_text,
               count(case_number) AS with_case_num,
               count(decision_date) AS with_date,
               count(court_type) AS with_court_type,
               count(judge) AS with_judge
        FROM pl_court_decisions GROUP BY source ORDER BY total DESC
    """, "PL: records per source")

    q("""
        SELECT source,
               count(*) FILTER (WHERE full_text IS NULL OR full_text = '') AS no_text,
               count(*) FILTER (WHERE length(full_text) < 100) AS tiny,
               count(*) FILTER (WHERE length(full_text) BETWEEN 100 AND 5000) AS short_med,
               count(*) FILTER (WHERE length(full_text) > 5000) AS long
        FROM pl_court_decisions GROUP BY source ORDER BY count(*) DESC
    """, "PL: text quality buckets")

    q("""
        SELECT count(*) AS dupe_groups, sum(cnt) AS total_rows_in_dupes
        FROM (
            SELECT case_number, decision_date, count(*) AS cnt
            FROM pl_court_decisions
            WHERE case_number IS NOT NULL AND decision_date IS NOT NULL
            GROUP BY case_number, decision_date HAVING count(*) > 1
        ) d
    """, "PL: duplicate groups (case_number + date)")

    q("""
        SELECT a.source AS src_a, b.source AS src_b, count(*) AS overlap
        FROM pl_court_decisions a
        JOIN pl_court_decisions b
            ON a.case_number = b.case_number AND a.decision_date = b.decision_date AND a.id < b.id
        WHERE a.case_number IS NOT NULL AND a.decision_date IS NOT NULL AND a.source != b.source
        GROUP BY a.source, b.source ORDER BY overlap DESC
    """, "PL: cross-source overlap (case+date)")

    q("""
        SELECT case_number, decision_date::text, array_agg(source), array_agg(length(coalesce(full_text,'')))
        FROM pl_court_decisions
        WHERE case_number IS NOT NULL AND decision_date IS NOT NULL
        GROUP BY case_number, decision_date HAVING count(*) > 1
        LIMIT 10
    """, "PL: sample duplicate groups")

    pl_unique = q("""
        SELECT count(DISTINCT (case_number, decision_date)) AS unique_keys
        FROM pl_court_decisions WHERE case_number IS NOT NULL AND decision_date IS NOT NULL
    """, "PL: unique (case+date) count")

    pl_no_key = q("SELECT count(*) FROM pl_court_decisions WHERE case_number IS NULL OR decision_date IS NULL",
                  "PL: records without dedup key")

    pl_total = q("SELECT count(*) FROM pl_court_decisions", "PL: total")

    print("\n" + "=" * 70, flush=True)
    print("CZECH REPUBLIC", flush=True)
    print("=" * 70, flush=True)

    q("""
        SELECT source, count(*) AS total,
               count(full_text) AS with_text,
               count(ecli) AS with_ecli,
               count(case_number) AS with_case_num,
               count(decision_date) AS with_date,
               count(judge) AS with_judge
        FROM cz_court_decisions GROUP BY source ORDER BY total DESC
    """, "CZ: records per source")

    q("""
        SELECT source,
               count(*) FILTER (WHERE full_text IS NULL OR full_text = '') AS no_text,
               count(*) FILTER (WHERE length(full_text) < 100) AS tiny,
               count(*) FILTER (WHERE length(full_text) BETWEEN 100 AND 5000) AS short_med,
               count(*) FILTER (WHERE length(full_text) > 5000) AS long
        FROM cz_court_decisions GROUP BY source ORDER BY count(*) DESC
    """, "CZ: text quality buckets")

    q("""
        SELECT count(*) AS dupe_groups, sum(cnt) AS total_rows_in_dupes
        FROM (
            SELECT ecli, count(*) AS cnt FROM cz_court_decisions
            WHERE ecli IS NOT NULL GROUP BY ecli HAVING count(*) > 1
        ) d
    """, "CZ: duplicate ECLI groups")

    q("""
        SELECT a.source AS src_a, b.source AS src_b, count(*) AS overlap
        FROM cz_court_decisions a
        JOIN cz_court_decisions b ON a.ecli = b.ecli AND a.id < b.id
        WHERE a.ecli IS NOT NULL AND a.source != b.source
        GROUP BY a.source, b.source ORDER BY overlap DESC
    """, "CZ: cross-source ECLI overlap")

    q("""
        SELECT ecli, array_agg(source), array_agg(length(coalesce(full_text,'')))
        FROM cz_court_decisions WHERE ecli IS NOT NULL
        GROUP BY ecli HAVING count(*) > 1 LIMIT 10
    """, "CZ: sample ECLI duplicates")

    cz_unique = q("SELECT count(DISTINCT ecli) FROM cz_court_decisions WHERE ecli IS NOT NULL",
                  "CZ: unique ECLI count")
    cz_no_ecli = q("SELECT count(*) FROM cz_court_decisions WHERE ecli IS NULL",
                   "CZ: records without ECLI")
    cz_total = q("SELECT count(*) FROM cz_court_decisions", "CZ: total")

    print("\n" + "=" * 70, flush=True)
    print("DEDUP SUMMARY", flush=True)
    print("=" * 70, flush=True)

    pl_t = pl_total[0][0]
    pl_u = pl_unique[0][0]
    pl_n = pl_no_key[0][0]
    print(f"  PL: {pl_t:,} total -> {pl_u:,} unique (case+date) + {pl_n:,} without key", flush=True)
    print(f"  PL after dedup: ~{pl_u + pl_n:,} (removing ~{pl_t - pl_u - pl_n:,} dupes)", flush=True)

    cz_t = cz_total[0][0]
    cz_u = cz_unique[0][0]
    cz_n = cz_no_ecli[0][0]
    print(f"  CZ: {cz_t:,} total -> {cz_u:,} unique ECLI + {cz_n:,} without ECLI", flush=True)
    print(f"  CZ after dedup: ~{cz_u + cz_n:,} (removing ~{cz_t - cz_u - cz_n:,} dupes)", flush=True)

    print(f"\n  COMBINED after dedup: ~{pl_u + pl_n + cz_u + cz_n:,}", flush=True)


if __name__ == "__main__":
    main()
