#!/usr/bin/env python3
"""
Fast parallel export of EDRSR docs to JSONL shards.
Optimized: larger FT batches, threaded fulltext fetch.
"""
import argparse
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import Process
from pathlib import Path

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("export-fast")

PG_BATCH = 10000
FT_BATCH = 2000
FT_THREADS = 2


def fetch_fulltext_batch(db_url, sub_ids):
    conn = psycopg2.connect(db_url, connect_timeout=60)
    conn.set_session(autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '600s'")
        cur.execute("""
            SELECT doc_id, full_text
            FROM edrsr_fulltext
            WHERE doc_id = ANY(%s)
              AND full_text IS NOT NULL AND full_text != ''
        """, (sub_ids,))
        result = {row[0]: row[1] for row in cur.fetchall()}
    conn.close()
    return result


def worker(shard_id, justice_kind, db_url, output_path, doc_id_start, doc_id_end):
    conn = psycopg2.connect(db_url, connect_timeout=60)
    conn.set_session(autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '600s'")
        cur.execute("SET work_mem = '256MB'")

    exported = 0
    skipped = 0
    last_doc_id = doc_id_start - 1
    t0 = time.time()

    with open(output_path, "w", buffering=8*1024*1024) as f:
        while True:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT d.doc_id, d.cause_num, d.court_code, d.judge,
                           d.adjudication_date::text, d.judgment_code, d.category_code
                    FROM edrsr_documents d
                    WHERE d.justice_kind = %s AND d.doc_id > %s AND d.doc_id <= %s
                    ORDER BY d.doc_id ASC
                    LIMIT %s
                """, (justice_kind, last_doc_id, doc_id_end, PG_BATCH))
                meta_rows = cur.fetchall()

            if not meta_rows:
                break

            doc_ids = [r[0] for r in meta_rows]
            meta_map = {}
            for r in meta_rows:
                meta_map[r[0]] = {
                    "doc_id": r[0],
                    "cause_num": r[1] or "",
                    "court_code": r[2] or 0,
                    "judge": r[3] or "",
                    "adjudication_date": r[4] or "",
                    "judgment_code": r[5] or 0,
                    "category_code": r[6] or 0,
                }

            chunks = [doc_ids[i:i + FT_BATCH] for i in range(0, len(doc_ids), FT_BATCH)]
            with ThreadPoolExecutor(max_workers=FT_THREADS) as executor:
                futures = {executor.submit(fetch_fulltext_batch, db_url, chunk): chunk for chunk in chunks}
                for future in as_completed(futures):
                    try:
                        ft_map = future.result()
                        for doc_id, text in ft_map.items():
                            if doc_id in meta_map:
                                meta_map[doc_id]["text"] = text
                    except Exception as e:
                        log.error(f"[shard {shard_id}] FT fetch error: {e}")

            batch_exported = 0
            for doc_id in doc_ids:
                doc = meta_map[doc_id]
                if "text" not in doc or len(doc["text"]) < 50:
                    skipped += 1
                    continue
                f.write(json.dumps(doc, ensure_ascii=False) + "\n")
                exported += 1
                batch_exported += 1

            last_doc_id = doc_ids[-1]
            elapsed = time.time() - t0
            rate = exported / elapsed if elapsed > 0 else 0
            if exported % 50000 < PG_BATCH:
                log.info(f"[shard {shard_id}] {exported:,} docs | {skipped:,} skipped | {rate:.0f} docs/s")

    conn.close()
    elapsed = time.time() - t0
    sz = os.path.getsize(output_path) / 1024 / 1024 / 1024
    log.info(f"[shard {shard_id}] DONE: {exported:,} docs, {skipped:,} skipped, {sz:.1f} GB in {elapsed/60:.1f} min")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--justice-kind", type=int, required=True)
    parser.add_argument("--db-url", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--num-shards", type=int, default=8)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"Connecting to compute shard boundaries...")
    conn = psycopg2.connect(args.db_url, connect_timeout=60)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '600s'")
        cur.execute("SELECT min(doc_id), max(doc_id) FROM edrsr_documents WHERE justice_kind = %s",
                    (args.justice_kind,))
        min_id, max_id = cur.fetchone()
        cur.execute("SELECT count(*) FROM edrsr_documents WHERE justice_kind = %s", (args.justice_kind,))
        total = cur.fetchone()[0]

        pcts = [i / args.num_shards for i in range(1, args.num_shards)]
        cur.execute(f"""
            SELECT unnest(percentile_cont(ARRAY[{','.join(str(p) for p in pcts)}])
                   WITHIN GROUP (ORDER BY doc_id))::bigint
            FROM edrsr_documents WHERE justice_kind = %s
        """, (args.justice_kind,))
        boundaries = [row[0] for row in cur.fetchall()]
    conn.close()

    all_bounds = [min_id - 1] + boundaries + [max_id]
    log.info(f"justice_kind={args.justice_kind}: {total:,} docs, {args.num_shards} shards")

    procs = []
    for i in range(args.num_shards):
        start = all_bounds[i]
        end = all_bounds[i + 1]
        output_path = str(out_dir / f"docs_{i:02d}.jsonl")
        log.info(f"  shard {i}: doc_id ({start}, {end}]")
        p = Process(target=worker, args=(i, args.justice_kind, args.db_url, output_path, start, end))
        p.start()
        procs.append(p)

    for p in procs:
        p.join()

    log.info("All shards done!")
    total_exported = 0
    for i in range(args.num_shards):
        path = out_dir / f"docs_{i:02d}.jsonl"
        if path.exists() and path.stat().st_size > 0:
            sz = path.stat().st_size / 1024 / 1024 / 1024
            with open(path) as ff:
                cnt = sum(1 for _ in ff)
            total_exported += cnt
            log.info(f"  shard {i}: {cnt:,} docs ({sz:.1f} GB)")
    log.info(f"Total exported: {total_exported:,}")


if __name__ == "__main__":
    main()
