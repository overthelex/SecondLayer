#!/usr/bin/env python3
"""
Build cocitation_edges table via Python streaming instead of SQL self-join.
The SQL approach generates 900GB+ temp files. This streams through _lcc_freq
grouped by court_case_id, generates article pairs in Python, and bulk-inserts.

Uses ~20-30GB RAM for the Counter of edge weights.
"""

import os
import sys
import time
from collections import Counter
from itertools import combinations
from pathlib import Path

import psycopg2

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@127.0.0.1:5432/secondlayer_local",
)

OUTPUT_DIR = Path(__file__).parent / "output"


def fmt_duration(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"


def main():
    print("=" * 70)
    print("Building cocitation_edges via Python streaming")
    print("=" * 70)

    t0 = time.time()
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()

    # Step 1: Stream _lcc_freq ordered by court_case_id
    print("\n[1/3] Streaming _lcc_freq grouped by court_case_id...")
    print("  Counting rows...")
    cur.execute("SELECT count(*) FROM _lcc_freq")
    total_rows = cur.fetchone()[0]
    print(f"  Total rows: {total_rows:,}")

    cur.execute("SET statement_timeout = '4h'")
    cur.execute("SET idle_in_transaction_session_timeout = '0'")
    cur.close()

    # Stream rows ordered by court_case_id (uses idx_lcc_freq_case index).
    # idle_in_transaction_session_timeout=0 prevents connection kill.
    stream_cur = conn.cursor("cocite_stream")
    stream_cur.itersize = 500000
    stream_cur.execute("""
        SELECT court_case_id, law_number, law_article
        FROM _lcc_freq
        ORDER BY court_case_id
    """)

    edge_weights = Counter()
    current_case_id = None
    current_articles = set()
    rows_processed = 0
    cases_processed = 0
    pairs_generated = 0
    MAX_ARTICLES_PER_CASE = 200

    t1 = time.time()

    for court_case_id, law_number, law_article in stream_cur:
        rows_processed += 1

        if court_case_id != current_case_id:
            if len(current_articles) >= 2:
                arts = sorted(current_articles)
                if len(arts) > MAX_ARTICLES_PER_CASE:
                    arts = arts[:MAX_ARTICLES_PER_CASE]
                for a, b in combinations(arts, 2):
                    edge_weights[(a, b)] += 1
                    pairs_generated += 1

            current_case_id = court_case_id
            current_articles = set()
            cases_processed += 1

        current_articles.add((law_number, law_article))

        if rows_processed % 10_000_000 == 0:
            elapsed = time.time() - t1
            rate = rows_processed / elapsed
            eta = (total_rows - rows_processed) / rate if rate > 0 else 0
            print(f"  {rows_processed:,}/{total_rows:,} rows "
                  f"({rows_processed/total_rows*100:.1f}%), "
                  f"{cases_processed:,} cases, "
                  f"{len(edge_weights):,} unique edges, "
                  f"{pairs_generated:,} pairs, "
                  f"rate: {rate:,.0f} r/s, "
                  f"ETA: {fmt_duration(eta)}", flush=True)

    # Process last case
    if len(current_articles) >= 2:
        arts = sorted(current_articles)
        if len(arts) > MAX_ARTICLES_PER_CASE:
            arts = arts[:MAX_ARTICLES_PER_CASE]
        for a, b in combinations(arts, 2):
            edge_weights[(a, b)] += 1
            pairs_generated += 1

    stream_cur.close()

    elapsed_stream = time.time() - t1
    print(f"\n  Streaming done in {fmt_duration(elapsed_stream)}")
    print(f"  Cases: {cases_processed:,}")
    print(f"  Pairs generated: {pairs_generated:,}")
    print(f"  Unique edges (before filter): {len(edge_weights):,}")

    # Step 2: Filter edges with weight >= 10 and save to CSV
    print("\n[2/3] Filtering edges with weight >= 10...")
    filtered = {k: v for k, v in edge_weights.items() if v >= 10}
    del edge_weights  # free memory
    print(f"  Edges with weight >= 10: {len(filtered):,}")

    # Save to CSV so we don't need to rerun streaming if insert fails
    import csv
    cache_path = OUTPUT_DIR / "cocitation_edges_raw.csv"
    with open(cache_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for (a, b), w in filtered.items():
            writer.writerow([a[0], a[1], b[0], b[1], w])
    print(f"  Cached to {cache_path} ({os.path.getsize(cache_path) / 1024 / 1024:.0f} MB)")

    # Step 3: Insert into table
    print("\n[3/3] Creating cocitation_edges table...")
    t2 = time.time()

    write_conn = psycopg2.connect(DB_DSN)
    write_conn.autocommit = True
    write_cur = write_conn.cursor()

    write_cur.execute("DROP TABLE IF EXISTS cocitation_edges")
    write_cur.execute("""
        CREATE TABLE cocitation_edges (
            law_a TEXT,
            art_a TEXT,
            law_b TEXT,
            art_b TEXT,
            weight BIGINT
        )
    """)

    # Bulk insert using execute_values (handles special chars in law names)
    from psycopg2.extras import execute_values
    rows = [(a[0], a[1], b[0], b[1], w) for (a, b), w in filtered.items()]
    print(f"  Inserting {len(rows):,} rows...")
    for i in range(0, len(rows), 50000):
        batch = rows[i:i+50000]
        execute_values(
            write_cur,
            "INSERT INTO cocitation_edges (law_a, art_a, law_b, art_b, weight) VALUES %s",
            batch,
            page_size=5000,
        )
        if (i + 50000) % 200000 == 0:
            print(f"    {i+len(batch):,}/{len(rows):,} inserted", flush=True)

    # Create indexes
    print("  Creating indexes...")
    write_cur.execute("CREATE INDEX ON cocitation_edges(law_a, art_a)")
    write_cur.execute("CREATE INDEX ON cocitation_edges(law_b, art_b)")
    write_cur.execute("CREATE INDEX ON cocitation_edges(weight DESC)")

    write_cur.execute("SELECT count(*), pg_size_pretty(pg_total_relation_size('cocitation_edges')) FROM cocitation_edges")
    count, size = write_cur.fetchone()
    print(f"  Table: {count:,} edges, {size}")

    write_cur.close()
    write_conn.close()
    conn.close()

    total_elapsed = time.time() - t0
    print(f"\nDone in {fmt_duration(total_elapsed)}")


if __name__ == "__main__":
    main()
