#!/usr/bin/env python3
"""Read-only scoping probe for the UA case-retrieval experiment. Determines
whether case_citation_links + text/date sources support a COLIEE-style
case->case retrieval task, and sizes the sample so we do not over-compute.
Runs ON prod. Prints findings only."""
import os
import psycopg2

conn = psycopg2.connect(host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
                        user=os.environ["POSTGRES_USER"],
                        password=os.environ["POSTGRES_PASSWORD"],
                        dbname=os.environ["POSTGRES_DB"])
cur = conn.cursor()
cur.execute("SET statement_timeout = '120000'")


def cols(t):
    cur.execute("""SELECT column_name, data_type FROM information_schema.columns
                   WHERE table_name=%s AND table_schema='public'
                   ORDER BY ordinal_position""", (t,))
    return cur.fetchall()


for t in ("case_citation_links", "edrsr_case_index", "edrsr_documents"):
    print(f"\n=== {t} columns ===")
    for c, d in cols(t):
        print(f"  {c}: {d}")

# fulltext columns (partitioned parent)
print("\n=== edrsr_fulltext columns ===")
for c, d in cols("edrsr_fulltext"):
    print(f"  {c}: {d}")

print("\n=== distinct query-capable decisions (non-self resolved precedent) ===")
cur.execute("""SELECT count(DISTINCT from_doc_id) FROM case_citation_links
               WHERE resolved AND NOT is_self_citation""")
print("  distinct from_doc_id:", cur.fetchone()[0])

print("\n=== out-degree distribution (non-self resolved precedent per decision) ===")
cur.execute("""
  WITH d AS (
    SELECT from_doc_id, count(*) AS k
    FROM case_citation_links
    WHERE resolved AND NOT is_self_citation
    GROUP BY from_doc_id)
  SELECT round(avg(k),2), percentile_cont(0.5) WITHIN GROUP (ORDER BY k),
         percentile_cont(0.9) WITHIN GROUP (ORDER BY k), max(k),
         count(*) FILTER (WHERE k>=1), count(*) FILTER (WHERE k>=3)
  FROM d""")
avg, p50, p90, mx, ge1, ge3 = cur.fetchone()
print(f"  mean {avg} median {p50} p90 {p90} max {mx}")
print(f"  decisions with >=1 precedent: {ge1} | >=3: {ge3}")

conn.close()
