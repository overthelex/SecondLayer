#!/usr/bin/env python3
"""Deduplication and quality analysis for all European court decision tables."""

import os
import time
import psycopg2

DB_URL = os.environ["DATABASE_URL"]


def q(sql, label=""):
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


def exe(sql, label=""):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    t0 = time.time()
    cur.execute(sql)
    affected = cur.rowcount
    conn.commit()
    conn.close()
    elapsed = time.time() - t0
    if label:
        print(f"  {label}: {affected:,} rows ({elapsed:.1f}s)", flush=True)
    return affected


def analyze_table(table, id_col="id", dedup_keys=None, text_col="full_text"):
    """Analyze and clean a single table."""
    print(f"\n{'='*60}", flush=True)
    print(f"  {table.upper()}", flush=True)
    print(f"{'='*60}", flush=True)

    q(f"SELECT count(*) as total, count({text_col}) as with_text FROM {table}", f"{table}: overview")

    q(f"""
        SELECT
            count(*) FILTER (WHERE {text_col} IS NULL OR {text_col} = '') AS no_text,
            count(*) FILTER (WHERE length({text_col}) < 100) AS tiny,
            count(*) FILTER (WHERE length({text_col}) BETWEEN 100 AND 1000) AS short,
            count(*) FILTER (WHERE length({text_col}) BETWEEN 1000 AND 10000) AS medium,
            count(*) FILTER (WHERE length({text_col}) > 10000) AS long
        FROM {table}
    """, f"{table}: text quality buckets")

    if dedup_keys:
        key_expr = ", ".join(dedup_keys)
        key_where = " AND ".join(f"{k} IS NOT NULL" for k in dedup_keys)

        q(f"""
            SELECT count(*) AS dupe_groups, sum(cnt) AS total_in_dupes
            FROM (
                SELECT {key_expr}, count(*) AS cnt
                FROM {table}
                WHERE {key_where}
                GROUP BY {key_expr} HAVING count(*) > 1
            ) d
        """, f"{table}: duplicate groups ({key_expr})")


def clean_table(table, id_col="id", dedup_keys=None, text_col="full_text"):
    """Remove duplicates and low-quality records."""
    print(f"\n--- Cleaning {table} ---", flush=True)
    removed = 0

    # Remove empty texts
    r = exe(f"DELETE FROM {table} WHERE {text_col} IS NOT NULL AND length({text_col}) = 0",
            f"empty text strings → NULL")

    # Remove micro-texts (<50 chars)
    r = exe(f"DELETE FROM {table} WHERE {text_col} IS NOT NULL AND length({text_col}) < 50",
            f"micro-texts (<50 chars)")
    removed += r

    # Deduplicate by key (keep longest text)
    if dedup_keys:
        key_expr = ", ".join(dedup_keys)
        key_where = " AND ".join(f"{k} IS NOT NULL" for k in dedup_keys)

        r = exe(f"""
            DELETE FROM {table} a
            USING (
                SELECT {key_expr}, max(length(coalesce({text_col}, ''))) as max_len
                FROM {table}
                WHERE {key_where}
                GROUP BY {key_expr} HAVING count(*) > 1
            ) dupes
            WHERE {' AND '.join(f'a.{k} = dupes.{k}' for k in dedup_keys)}
              AND length(coalesce(a.{text_col}, '')) < dupes.max_len
        """, f"dedup by ({key_expr}), keep longest")
        removed += r

        # If same length, keep first by id
        r = exe(f"""
            DELETE FROM {table} a
            USING (
                SELECT {key_expr}, min({id_col}) as keep_id
                FROM {table}
                WHERE {key_where}
                GROUP BY {key_expr} HAVING count(*) > 1
            ) dupes
            WHERE {' AND '.join(f'a.{k} = dupes.{k}' for k in dedup_keys)}
              AND a.{id_col} != dupes.keep_id
        """, f"dedup same-length by ({key_expr}), keep first")
        removed += r

    q(f"SELECT count(*) as remaining, count({text_col}) as with_text FROM {table}",
      f"{table}: after cleaning")

    return removed


def main():
    print("=" * 60, flush=True)
    print("  EUROPEAN COURT DECISIONS — DEDUP & QUALITY ANALYSIS", flush=True)
    print("=" * 60, flush=True)

    tables = [
        ("pl_court_decisions", "id", ["case_number", "decision_date"], "full_text"),
        ("fr_court_decisions", "id", ["ecli"], "full_text"),
        ("nl_rechtspraak_decisions", "ecli", ["ecli"], "full_text"),
        ("cz_court_decisions", "id", ["ecli"], "full_text"),
        ("lv_court_decisions", "id", ["case_number", "decision_date"], "full_text"),
        ("de_court_decisions", "id", ["ecli"], "full_text"),
        ("hu_court_decisions", "id", ["egyedi_azonosito"], "full_text"),
        ("lt_court_decisions", "id", ["dokumento_id"], "full_text"),
        ("be_court_decisions", "id", ["ecli"], "full_text"),
        ("ee_court_decisions", "id", ["case_number", "decision_date"], "full_text"),
        ("lu_court_decisions", "id", None, "full_text"),
        ("ch_court_decisions", "id", None, "full_text"),
    ]

    # Phase 1: Analysis
    print("\n\n### PHASE 1: ANALYSIS ###\n", flush=True)
    for table, id_col, dedup_keys, text_col in tables:
        try:
            analyze_table(table, id_col, dedup_keys, text_col)
        except Exception as e:
            print(f"  {table}: ERROR - {e}", flush=True)

    # Phase 2: Cleaning
    print("\n\n### PHASE 2: CLEANING ###\n", flush=True)
    total_removed = 0
    for table, id_col, dedup_keys, text_col in tables:
        try:
            r = clean_table(table, id_col, dedup_keys, text_col)
            total_removed += r
        except Exception as e:
            print(f"  {table}: CLEAN ERROR - {e}", flush=True)

    # Phase 3: Final summary
    print("\n\n### FINAL SUMMARY ###\n", flush=True)
    print(f"  Total removed: {total_removed:,}\n", flush=True)

    q("""
        SELECT 'PL' as country, count(*) as records, count(full_text) as with_text FROM pl_court_decisions UNION ALL
        SELECT 'FR', count(*), count(full_text) FROM fr_court_decisions UNION ALL
        SELECT 'NL', count(*), count(full_text) FROM nl_rechtspraak_decisions UNION ALL
        SELECT 'CZ', count(*), count(full_text) FROM cz_court_decisions UNION ALL
        SELECT 'CH', count(*), count(full_text) FROM ch_court_decisions UNION ALL
        SELECT 'LV', count(*), count(full_text) FROM lv_court_decisions UNION ALL
        SELECT 'DE', count(*), count(full_text) FROM de_court_decisions UNION ALL
        SELECT 'HU', count(*), count(full_text) FROM hu_court_decisions UNION ALL
        SELECT 'LT', count(*), count(full_text) FROM lt_court_decisions UNION ALL
        SELECT 'LU', count(*), count(full_text) FROM lu_court_decisions UNION ALL
        SELECT 'BE', count(*), count(full_text) FROM be_court_decisions UNION ALL
        SELECT 'EE', count(*), count(full_text) FROM ee_court_decisions
        ORDER BY records DESC
    """, "ALL COUNTRIES")

    q("""
        SELECT sum(records) as total_records, sum(with_text) as total_with_text FROM (
            SELECT count(*) as records, count(full_text) as with_text FROM pl_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM fr_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM nl_rechtspraak_decisions UNION ALL
            SELECT count(*), count(full_text) FROM cz_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM ch_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM lv_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM de_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM hu_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM lt_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM lu_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM be_court_decisions UNION ALL
            SELECT count(*), count(full_text) FROM ee_court_decisions
        ) t
    """, "GRAND TOTAL")


if __name__ == "__main__":
    main()
