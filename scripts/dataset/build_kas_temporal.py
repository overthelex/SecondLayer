#!/usr/bin/env python3
"""Build a balanced KAS (administrative) temporal-drift dataset on PROD.

3 epochs x {granted, denied, partial}, balanced to the smallest cell.
Reuses the EXACT section-extraction + outcome classifier from
scripts/dataset/extract_case_outcome.py (administrative branch).

Output: ~/kas-temporal-drift/ with parquet configs (pre_war/hybrid_war/
full_scale/all) x (train/val/test), schema matching overthelex/ua-temporal-drift.
Run on prod (has secondlayer_prod :5438 with edrsr_*_p_YEAR partitions)."""
import os, sys, json, random
import psycopg2
from psycopg2.extras import RealDictCursor
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, os.path.expanduser("~/SecondLayer/scripts/dataset"))
from extract_case_outcome import extract_sections, classify_outcome, clean_text

JK_ADMIN = 4                       # administrative justice_kind
SUBSTANTIVE = (2, 3)               # постанова (pre-2017 merits) + рішення (post-2017)
KEEP = ("granted", "denied", "partial")
TARGET_POOL = 6000                 # max collected per (epoch x class) before balancing
SEED = 42
OUT = os.path.expanduser("~/kas-temporal-drift")

EPOCHS = {
    "pre_war":    [2008, 2009, 2010, 2011, 2012, 2013],
    "hybrid_war": [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021],
    "full_scale": [2022, 2023, 2024, 2025, 2026],
}

DB = {"host": "127.0.0.1", "port": 5438, "dbname": "secondlayer_prod",
      "user": "secondlayer", "password": os.environ["PGPASSWORD"]}


def collect(conn):
    pools = {ep: {c: [] for c in KEEP} for ep in EPOCHS}
    for ep, years in EPOCHS.items():
        for year in years:
            if all(len(pools[ep][c]) >= TARGET_POOL for c in KEEP):
                break
            dtab, ftab = f"edrsr_documents_p_{year}", f"edrsr_fulltext_p_{year}"
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"""
                    SELECT doc_id, justice_kind, judgment_code, category_code,
                           court_code, judge, adjudication_date::text
                    FROM {dtab}
                    WHERE judgment_code IN %s AND justice_kind = %s
                    LIMIT 60000
                """, (SUBSTANTIVE, JK_ADMIN))
                meta = cur.fetchall()
                random.shuffle(meta)
                for i in range(0, len(meta), 200):
                    if all(len(pools[ep][c]) >= TARGET_POOL for c in KEEP):
                        break
                    batch = meta[i:i+200]
                    ids = [r["doc_id"] for r in batch]
                    cur.execute(f"SELECT doc_id, full_text FROM {ftab} WHERE doc_id = ANY(%s)", (ids,))
                    texts = {r["doc_id"]: r["full_text"] for r in cur.fetchall()}
                    for r in batch:
                        t = texts.get(r["doc_id"])
                        if not t or not (3000 <= len(t) <= 50000):
                            continue
                        sec = extract_sections(t)
                        if not sec["facts"] or len(sec["facts"]) < 200:
                            continue
                        if not sec["dispositive"] or len(sec["dispositive"]) < 50:
                            continue
                        oc = classify_outcome(sec["dispositive"], JK_ADMIN)
                        if oc not in KEEP or len(pools[ep][oc]) >= TARGET_POOL:
                            continue
                        pools[ep][oc].append({
                            "text": clean_text(sec["facts"]),
                            "label": oc,
                            "epoch": ep,
                            "adjudication_date": r["adjudication_date"],
                            "jurisdiction": "administrative",
                            "doc_id": str(r["doc_id"]),
                            "year": year,
                            "language": "uk",
                        })
            print(f"  {ep}/{year}: " + ", ".join(f"{c}={len(pools[ep][c])}" for c in KEEP), flush=True)
    return pools


def main():
    random.seed(SEED)
    conn = psycopg2.connect(**DB)
    conn.set_client_encoding("UTF8")
    with conn.cursor() as c:
        c.execute("SET statement_timeout = 180000")
    pools = collect(conn)
    conn.close()

    print("\n=== collected pool sizes ===")
    for ep in EPOCHS:
        print(f"  {ep}: " + ", ".join(f"{c}={len(pools[ep][c])}" for c in KEEP))

    per_cell = min(len(pools[ep][c]) for ep in EPOCHS for c in KEEP)
    print(f"\nBalancing every (epoch x class) cell to {per_cell}")

    # balance + split 80/10/10 per cell
    splits = {"train": [], "validation": [], "test": []}
    for ep in EPOCHS:
        for c in KEEP:
            rows = pools[ep][c][:]
            random.shuffle(rows)
            rows = rows[:per_cell]
            n_test = max(1, per_cell // 10)
            n_val = max(1, per_cell // 10)
            splits["test"] += rows[:n_test]
            splits["validation"] += rows[n_test:n_test+n_val]
            splits["train"] += rows[n_test+n_val:]
    for s in splits.values():
        random.shuffle(s)

    # write parquet: 'all' + per-epoch configs
    os.makedirs(OUT, exist_ok=True)
    def write_cfg(cfg, rowsets):
        for split, rows in rowsets.items():
            if not rows:
                continue
            d = os.path.join(OUT, "data", cfg, split)
            os.makedirs(d, exist_ok=True)
            pq.write_table(pa.Table.from_pylist(rows),
                           os.path.join(d, "0000.parquet"), compression="zstd")

    write_cfg("all", splits)
    for ep in EPOCHS:
        ep_splits = {s: [r for r in rows if r["epoch"] == ep] for s, rows in splits.items()}
        write_cfg(ep, ep_splits)

    print("\n=== FINAL ===")
    print(f"per cell: {per_cell}  total: {per_cell*9}")
    for s in ("train", "validation", "test"):
        print(f"  {s}: {len(splits[s])}")
    # balance table
    from collections import Counter
    print("\nlabel x epoch (all splits):")
    tab = Counter((r['epoch'], r['label']) for s in splits.values() for r in s)
    print(f"{'epoch':<12}" + "".join(f"{c:>10}" for c in KEEP))
    for ep in EPOCHS:
        print(f"{ep:<12}" + "".join(f"{tab[(ep,c)]:>10}" for c in KEEP))
    print(f"\nOutput: {OUT}")


if __name__ == "__main__":
    main()
