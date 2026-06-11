#!/usr/bin/env python3
"""
EVAL-500K: stratified sample of EDRSR decisions for the citation-grounded
embedding benchmark.

Stratification: justice_kind (1-4) x adjudication year (2010-2025).
Filters: substantive judgment codes (Вирок/Постанова/Рішення), full text
present and >= --min-chars. Allocation proportional to cell population with
a per-cell floor so temporal slices keep statistical power.

Two passes per year (checkpointed, resumable):
  1. cell counts (metadata only)
  2. random oversample via setseed()+random(), then text-length verification
     against edrsr_fulltext_p_{year}, trim to exact allocation

Usage:
  source mcp_backend/.env equivalents or set DATABASE_URL, then:
  python3 12_sample_eval500k.py --counts-only          # pass 1 + allocation preview
  python3 12_sample_eval500k.py                        # full run -> output/eval500k/
  python3 12_sample_eval500k.py --target 2000 --floor 20 --years 2020 2021   # smoke
  python3 12_sample_eval500k.py --export-text          # jsonl shards, citations stripped
"""

import argparse
import csv
import json
import logging
import os
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval500k_common import (
    DB_DSN, DEFAULT_JUDGMENT_CODES, JUSTICE_KINDS, YEAR_MIN, YEAR_MAX,
    strip_citations,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("sample")

OUTPUT_DIR = Path(__file__).parent / "output" / "eval500k"

OVERSAMPLE = 1.4          # headroom for docs failing the text-length check
SEED = 0.42               # setseed() for reproducible SQL random()


def get_conn():
    return psycopg2.connect(DB_DSN)


# ── Pass 1: cell counts ─────────────────────────────────────────────────────

def count_cells(conn, years, kinds, judgment_codes):
    counts = {}
    with conn.cursor() as cur:
        for year in years:
            cur.execute(
                """
                SELECT justice_kind, COUNT(*)
                FROM edrsr_documents
                WHERE adjudication_date >= make_date(%s, 1, 1)
                  AND adjudication_date <  make_date(%s, 1, 1)
                  AND justice_kind = ANY(%s)
                  AND judgment_code = ANY(%s)
                GROUP BY justice_kind
                """,
                (year, year + 1, list(kinds), list(judgment_codes)),
            )
            for kind, n in cur.fetchall():
                counts[(year, kind)] = n
            log.info("counts %d: %s", year,
                     {JUSTICE_KINDS[k]: counts.get((year, k), 0) for k in kinds})
    return counts


def allocate(counts, target, floor):
    """Proportional allocation with floor, capped at cell population."""
    total = sum(counts.values())
    alloc = {}
    for cell, n in counts.items():
        alloc[cell] = min(n, max(floor, round(target * n / total)))
    # trim overshoot from the largest cells (floor inflates the total)
    overshoot = sum(alloc.values()) - target
    for cell in sorted(alloc, key=alloc.get, reverse=True):
        if overshoot <= 0:
            break
        reducible = alloc[cell] - max(floor, 1)
        cut = min(reducible, overshoot)
        alloc[cell] -= cut
        overshoot -= cut
    return alloc


# ── Pass 2: per-year sampling + text verification ───────────────────────────

def sample_year(conn, year, kinds, judgment_codes, year_alloc, counts, min_chars):
    """Oversample the year partition once, verify text length, trim per cell."""
    max_frac = max(
        (OVERSAMPLE * year_alloc.get((year, k), 0) / counts[(year, k)])
        for k in kinds if counts.get((year, k))
    )
    max_frac = min(1.0, max_frac)
    log.info("year %d: scan with random() < %.5f", year, max_frac)

    candidates = defaultdict(list)
    with conn.cursor("sample_%d" % year) as cur:  # server-side cursor
        cur.itersize = 50_000
        cur.execute(
            """
            SELECT doc_id, justice_kind, judgment_code, court_code, cause_num,
                   EXTRACT(YEAR FROM adjudication_date)::int AS adj_year
            FROM edrsr_documents
            WHERE adjudication_date >= make_date(%s, 1, 1)
              AND adjudication_date <  make_date(%s, 1, 1)
              AND justice_kind = ANY(%s)
              AND judgment_code = ANY(%s)
              AND random() < %s
            """,
            (year, year + 1, list(kinds), list(judgment_codes), max_frac),
        )
        for row in cur:
            candidates[row[1]].append(row)

    # verify text length in batches, keep first `alloc` passing docs per cell
    kept = []
    with conn.cursor() as cur:
        for kind in kinds:
            need = year_alloc.get((year, kind), 0)
            rows = candidates.get(kind, [])
            taken = 0
            for i in range(0, len(rows), 5000):
                if taken >= need:
                    break
                batch = rows[i:i + 5000]
                cur.execute(
                    f"""
                    SELECT doc_id, length(full_text)
                    FROM edrsr_fulltext_p_{year}
                    WHERE doc_id = ANY(%s) AND length(full_text) >= %s
                    """,
                    ([r[0] for r in batch], min_chars),
                )
                ok = dict(cur.fetchall())
                for r in batch:
                    if taken >= need:
                        break
                    if r[0] in ok:
                        kept.append(r + (ok[r[0]],))
                        taken += 1
            if taken < need:
                log.warning("year %d kind %s: only %d/%d after text filter "
                            "(raise OVERSAMPLE or lower --min-chars)",
                            year, JUSTICE_KINDS[kind], taken, need)
    return kept


# ── Text export ──────────────────────────────────────────────────────────────

def export_text(conn, sample_rows, out_dir, shard_size, no_strip):
    """Write jsonl shards {doc_id, adj_year, justice_kind, text} with citations stripped."""
    out_dir.mkdir(parents=True, exist_ok=True)
    by_year = defaultdict(list)
    for r in sample_rows:
        by_year[r["adj_year"]].append(r)

    written = 0
    with conn.cursor() as cur:
        for year in sorted(by_year):
            rows = by_year[year]
            meta = {r["doc_id"]: r for r in rows}
            ids = list(meta)
            shard_idx, buf = 0, []

            def flush():
                nonlocal shard_idx, buf
                if not buf:
                    return
                path = out_dir / f"texts-{year}-{shard_idx:04d}.jsonl"
                with open(path, "w", encoding="utf-8") as f:
                    f.writelines(buf)
                shard_idx += 1
                buf = []

            for i in range(0, len(ids), 2000):
                cur.execute(
                    f"SELECT doc_id, full_text FROM edrsr_fulltext_p_{year} WHERE doc_id = ANY(%s)",
                    (ids[i:i + 2000],),
                )
                for doc_id, text in cur.fetchall():
                    m = meta[doc_id]
                    out = text if no_strip else strip_citations(text)
                    buf.append(json.dumps(
                        {"doc_id": doc_id, "adj_year": m["adj_year"],
                         "justice_kind": m["justice_kind"], "text": out},
                        ensure_ascii=False) + "\n")
                    written += 1
                    if len(buf) >= shard_size:
                        flush()
            flush()
            log.info("export year %d done (%d docs total)", year, written)
    log.info("exported %d docs to %s (%d shards)", written, out_dir, shard_idx)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target", type=int, default=500_000)
    ap.add_argument("--floor", type=int, default=2_000, help="min docs per (year, kind) cell")
    ap.add_argument("--min-chars", type=int, default=1_000)
    ap.add_argument("--years", type=int, nargs="*", default=list(range(YEAR_MIN, YEAR_MAX + 1)))
    ap.add_argument("--judgment-codes", type=int, nargs="*", default=list(DEFAULT_JUDGMENT_CODES))
    ap.add_argument("--counts-only", action="store_true")
    ap.add_argument("--export-text", action="store_true")
    ap.add_argument("--no-strip", action="store_true", help="export raw text (leak ablation)")
    ap.add_argument("--shard-size", type=int, default=10_000)
    args = ap.parse_args()

    kinds = sorted(JUSTICE_KINDS)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sample_path = OUTPUT_DIR / "sample.csv"

    conn = get_conn()
    conn.set_session(readonly=True)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '120min'")
        cur.execute("SELECT setseed(%s)", (SEED,))

    # text export over an existing sample
    if args.export_text and sample_path.exists():
        years = set(args.years)
        with open(sample_path) as f:
            rows = [{**r, "doc_id": int(r["doc_id"]), "adj_year": int(r["adj_year"]),
                     "justice_kind": int(r["justice_kind"])} for r in csv.DictReader(f)
                    if int(r["adj_year"]) in years]
        suffix = "raw" if args.no_strip else "stripped"
        export_text(conn, rows, OUTPUT_DIR / f"texts_{suffix}", args.shard_size, args.no_strip)
        return

    # pass 1
    counts_path = OUTPUT_DIR / "cell_counts.json"
    counts = None
    if counts_path.exists():
        cached = {tuple(map(int, k.split(","))): v
                  for k, v in json.load(open(counts_path)).items()}
        if set(args.years) <= {y for y, _ in cached}:
            counts = {c: n for c, n in cached.items() if c[0] in args.years}
            log.info("loaded cached cell counts (%d cells)", len(counts))
        else:
            log.info("cached counts do not cover requested years, recounting")
    if counts is None:
        counts = count_cells(conn, args.years, kinds, args.judgment_codes)
        json.dump({f"{y},{k}": n for (y, k), n in counts.items()}, open(counts_path, "w"))

    alloc = allocate(counts, args.target, args.floor)
    log.info("population %s docs, allocated %s",
             f"{sum(counts.values()):,}", f"{sum(alloc.values()):,}")
    if args.counts_only:
        for (y, k) in sorted(alloc):
            print(f"{y} {JUSTICE_KINDS[k]:>15}: pop={counts[(y, k)]:>9,} alloc={alloc[(y, k)]:>7,}")
        return

    # pass 2, checkpointed per year
    fieldnames = ["doc_id", "justice_kind", "judgment_code", "court_code",
                  "cause_num", "adj_year", "text_len"]
    all_rows = []
    for year in args.years:
        ckpt = OUTPUT_DIR / f"year_{year}.csv"
        if ckpt.exists():
            log.info("year %d: checkpoint exists, skipping", year)
            with open(ckpt) as f:
                all_rows.extend(list(csv.DictReader(f)))
            continue
        kept = sample_year(conn, year, kinds, args.judgment_codes, alloc, counts, args.min_chars)
        with open(ckpt, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(fieldnames)
            for r in kept:
                w.writerow([r[0], r[1], r[2], r[3], r[4], r[5], r[6]])
        with open(ckpt) as f:
            all_rows.extend(list(csv.DictReader(f)))
        log.info("year %d: kept %d docs", year, len(kept))

    with open(sample_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(all_rows)

    manifest = {
        "target": args.target, "floor": args.floor, "min_chars": args.min_chars,
        "years": args.years, "judgment_codes": args.judgment_codes,
        "seed": SEED, "oversample": OVERSAMPLE,
        "population": sum(counts.values()), "sampled": len(all_rows),
        "cells": {f"{y},{k}": {"population": counts[(y, k)], "allocated": alloc[(y, k)]}
                  for (y, k) in sorted(alloc)},
    }
    json.dump(manifest, open(OUTPUT_DIR / "manifest.json", "w"), indent=2)
    log.info("DONE: %d docs -> %s", len(all_rows), sample_path)


if __name__ == "__main__":
    main()
