#!/usr/bin/env python3
"""
Citation Graph Paper — extract legislation citations from EDRSR court decisions.

Processes edrsr_fulltext partitions in parallel, extracting references to
Ukrainian legislation (law numbers, article references, codex citations).
Results are written to law_court_citations table.

Usage:
  python3 extract-citations.py --year 2024            # single year
  python3 extract-citations.py --all                  # all years
  python3 extract-citations.py --year 2024 --dry-run  # preview only
  python3 extract-citations.py --year 2024 --workers 4

Designed to run on prod (direct DB access, no network overhead).
Run in screen/tmux with low priority: nice -n 10 python3 extract-citations.py --all
"""

import argparse
import os
import re
import sys
import time
import json
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional

import psycopg2
from psycopg2.extras import execute_values

# ── Database connection ──────────────────────────────────────

DB_DSN = os.environ.get("DATABASE_URL", "postgresql://secondlayer:local_dev_password@localhost:5432/secondlayer_local")

def get_conn():
    return psycopg2.connect(DB_DSN)

# ── Citation patterns ────────────────────────────────────────

# Ukrainian law reference patterns
PATTERNS = {
    # "статті 3, 5 Закону України «Про ...»" or "ст. 3 ЗУ «Про ...»"
    "law_article": re.compile(
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+)'
        r'\s+(?:Закону\s+України|ЗУ|Закону)\s+'
        r'(?:[«"]([^»"]+)[»"]|(?:від|№)\s*(\d[\d.\-/]+))',
        re.IGNORECASE | re.UNICODE
    ),
    # Codex references: "ст. 625 ЦК України", "ч. 1 ст. 3 КАС України"
    "codex_article": re.compile(
        r'(?:(?:ч(?:астин[аи]|\.)\s*\d+\s+)?'
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+))\s+'
        r'(ЦК|КК|ГК|ГПК|КПК|КАС|ЦПК|КЗпП|СК|ЗК|ПК|МК|БК|ВК|ЛК|ЖК|КУпАП|КАСУ)'
        r'(?:\s+України)?',
        re.IGNORECASE | re.UNICODE
    ),
    # Constitution: "стаття 124 Конституції України"
    "constitution": re.compile(
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+)\s+'
        r'Конституці[їі]\s+України',
        re.IGNORECASE | re.UNICODE
    ),
    # Case number references: "справа № 200/1234/24"
    "case_reference": re.compile(
        r'(?:справ[аи]\s*)?№\s*(\d{1,4}/\d+/\d{2,4})',
        re.IGNORECASE
    ),
    # Law by number: "Закон України від 01.01.2020 № 123-IX"
    "law_by_number": re.compile(
        r'Закон(?:у|ом)?\s+України\s+'
        r'(?:від\s+(\d{2}\.\d{2}\.\d{4})\s+)?'
        r'№\s*([\d\-]+(?:\-[IVX]+)?)',
        re.IGNORECASE | re.UNICODE
    ),
    # Постанова Пленуму Верховного Суду
    "supreme_court_ruling": re.compile(
        r'(?:постанов[аиі]|ухвал[аиі])\s+'
        r'(?:Пленуму\s+)?'
        r'(?:Верховного\s+Суду|ВС|Великої\s+Палати\s+ВС)',
        re.IGNORECASE | re.UNICODE
    ),
}

# Codex full names for normalization
CODEX_NAMES = {
    "ЦК": "Цивільний кодекс України",
    "КК": "Кримінальний кодекс України",
    "ГК": "Господарський кодекс України",
    "ГПК": "Господарський процесуальний кодекс України",
    "КПК": "Кримінальний процесуальний кодекс України",
    "КАС": "Кодекс адміністративного судочинства України",
    "КАСУ": "Кодекс адміністративного судочинства України",
    "ЦПК": "Цивільний процесуальний кодекс України",
    "КЗпП": "Кодекс законів про працю України",
    "СК": "Сімейний кодекс України",
    "ЗК": "Земельний кодекс України",
    "ПК": "Податковий кодекс України",
    "МК": "Митний кодекс України",
    "БК": "Бюджетний кодекс України",
    "ВК": "Водний кодекс України",
    "ЛК": "Лісовий кодекс України",
    "ЖК": "Житловий кодекс України",
    "КУпАП": "Кодекс України про адміністративні правопорушення",
}

@dataclass
class Citation:
    doc_id: int
    citation_type: str  # law_article, codex_article, constitution, case_reference, law_by_number, supreme_court_ruling
    law_ref: str        # normalized law/codex identifier
    article_ref: str    # article number(s) or empty
    raw_match: str      # original matched text

@dataclass
class PartitionStats:
    year: int
    rows_processed: int = 0
    citations_found: int = 0
    by_type: dict = field(default_factory=Counter)
    top_laws: dict = field(default_factory=Counter)
    elapsed_sec: float = 0

# ── Extraction ───────────────────────────────────────────────

def parse_article_numbers(raw: str) -> list[str]:
    """Parse '3, 5, 7-9 та 12' into ['3', '5', '7', '8', '9', '12']."""
    articles = []
    raw = raw.replace("та", ",").replace("і", ",").replace("й", ",")
    for part in raw.split(","):
        part = part.strip()
        if "-" in part:
            try:
                a, b = part.split("-", 1)
                for n in range(int(a.strip()), int(b.strip()) + 1):
                    articles.append(str(n))
            except ValueError:
                articles.append(part)
        elif part.isdigit():
            articles.append(part)
    return articles

def extract_citations_from_text(doc_id: int, text: str) -> list[Citation]:
    citations = []

    for m in PATTERNS["law_article"].finditer(text):
        articles_raw = m.group(1)
        law_name = m.group(2) or m.group(3) or ""
        for art in parse_article_numbers(articles_raw):
            citations.append(Citation(doc_id, "law_article", law_name.strip(), art, m.group(0)[:200]))

    for m in PATTERNS["codex_article"].finditer(text):
        articles_raw = m.group(1)
        codex_abbr = m.group(2).upper()
        codex_name = CODEX_NAMES.get(codex_abbr, codex_abbr)
        for art in parse_article_numbers(articles_raw):
            citations.append(Citation(doc_id, "codex_article", codex_name, art, m.group(0)[:200]))

    for m in PATTERNS["constitution"].finditer(text):
        articles_raw = m.group(1)
        for art in parse_article_numbers(articles_raw):
            citations.append(Citation(doc_id, "constitution", "Конституція України", art, m.group(0)[:200]))

    for m in PATTERNS["case_reference"].finditer(text):
        citations.append(Citation(doc_id, "case_reference", m.group(1), "", m.group(0)[:200]))

    for m in PATTERNS["law_by_number"].finditer(text):
        law_num = m.group(2) or ""
        law_date = m.group(1) or ""
        ref = f"№{law_num}" + (f" від {law_date}" if law_date else "")
        citations.append(Citation(doc_id, "law_by_number", ref, "", m.group(0)[:200]))

    for m in PATTERNS["supreme_court_ruling"].finditer(text):
        citations.append(Citation(doc_id, "supreme_court_ruling", "ВС", "", m.group(0)[:200]))

    return citations

# ── Worker ───────────────────────────────────────────────────

_JUSTICE_KIND_FILTER = None

def process_chunk(args: tuple) -> dict:
    """Process a chunk of rows from a partition. Runs in a separate process."""
    year, offset, chunk_size = args
    conn = get_conn()
    cur = conn.cursor(name=f"cite_{year}_{offset}")

    partition = f"edrsr_fulltext_p_{year}"
    if _JUSTICE_KIND_FILTER is not None:
        cur.execute(
            f"SELECT f.doc_id, f.full_text FROM {partition} f "
            f"JOIN edrsr_documents d ON f.doc_id = d.doc_id "
            f"WHERE d.justice_kind = %s "
            f"OFFSET %s LIMIT %s",
            (_JUSTICE_KIND_FILTER, offset, chunk_size),
        )
    else:
        cur.execute(f"SELECT doc_id, full_text FROM {partition} OFFSET %s LIMIT %s", (offset, chunk_size))

    all_citations = []
    rows = 0
    type_counts = Counter()

    for doc_id, text in cur:
        rows += 1
        if not text:
            continue
        cites = extract_citations_from_text(doc_id, text)
        all_citations.extend(cites)
        for c in cites:
            type_counts[c.citation_type] += 1

    cur.close()
    conn.close()

    return {
        "year": year,
        "offset": offset,
        "rows": rows,
        "citations": len(all_citations),
        "type_counts": dict(type_counts),
        "data": [(c.doc_id, c.citation_type, c.law_ref, c.article_ref, c.raw_match) for c in all_citations],
    }

def write_citations(results: list[tuple], justice_kind: int = None, adj_year: int = None):
    """Bulk-insert citation results."""
    if not results:
        return
    conn = get_conn()
    cur = conn.cursor()
    execute_values(
        cur,
        """INSERT INTO law_court_citations
           (court_case_id, citation_type, law_number, law_article, citation_context, justice_kind, adj_year)
           VALUES %s""",
        [(r[0], r[1], r[2], r[3], r[4][:500], justice_kind, adj_year) for r in results],
        page_size=5000,
    )
    conn.commit()
    cur.close()
    conn.close()

# ── Main ─────────────────────────────────────────────────────

def process_year(year: int, workers: int, dry_run: bool, chunk_size: int = 50000) -> PartitionStats:
    stats = PartitionStats(year=year)
    t0 = time.time()

    conn = get_conn()
    cur = conn.cursor()
    partition = f"edrsr_fulltext_p_{year}"
    if _JUSTICE_KIND_FILTER is not None:
        cur.execute(
            f"SELECT COUNT(*) FROM {partition} f JOIN edrsr_documents d ON f.doc_id = d.doc_id WHERE d.justice_kind = %s",
            (_JUSTICE_KIND_FILTER,),
        )
    else:
        cur.execute(f"SELECT COUNT(*) FROM {partition}")
    total = cur.fetchone()[0]
    cur.close()
    conn.close()

    if total == 0:
        print(f"  Year {year}: 0 rows, skipping")
        return stats

    chunks = [(year, offset, chunk_size) for offset in range(0, total, chunk_size)]
    print(f"  Year {year}: {total:,} rows, {len(chunks)} chunks, {workers} workers")

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(process_chunk, c): c for c in chunks}

        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            stats.rows_processed += result["rows"]
            stats.citations_found += result["citations"]
            for k, v in result["type_counts"].items():
                stats.by_type[k] += v

            if not dry_run and result["data"]:
                write_citations(result["data"], justice_kind=_JUSTICE_KIND_FILTER, adj_year=year)

            if (i + 1) % 10 == 0 or i == len(futures) - 1:
                elapsed = time.time() - t0
                rate = stats.rows_processed / elapsed if elapsed > 0 else 0
                print(f"    [{i+1}/{len(chunks)}] {stats.rows_processed:,} rows, {stats.citations_found:,} citations, {rate:,.0f} rows/sec")

    stats.elapsed_sec = time.time() - t0
    return stats

def main():
    parser = argparse.ArgumentParser(description="Extract citations from EDRSR court decisions")
    parser.add_argument("--year", type=int, help="Process single year")
    parser.add_argument("--all", action="store_true", help="Process all years")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--workers", type=int, default=2, help="Number of parallel workers")
    parser.add_argument("--chunk-size", type=int, default=50000, help="Rows per chunk")
    parser.add_argument("--years-from", type=int, default=2007, help="Start year for --all")
    parser.add_argument("--years-to", type=int, default=2026, help="End year for --all")
    parser.add_argument("--justice-kind", type=int, default=None, help="Filter by justice_kind (e.g. 5 for КУпАП)")
    args = parser.parse_args()

    if not args.year and not args.all:
        parser.error("Specify --year YYYY or --all")

    global _JUSTICE_KIND_FILTER
    _JUSTICE_KIND_FILTER = args.justice_kind

    years = list(range(args.years_from, args.years_to + 1)) if args.all else [args.year]

    jk_label = f", justice_kind={args.justice_kind}" if args.justice_kind else ""
    print(f"=== Citation Extraction Pipeline ===")
    print(f"Years: {years[0]}–{years[-1]} ({len(years)} years){jk_label}")
    print(f"Workers: {args.workers}, Chunk: {args.chunk_size:,}")
    print(f"Dry run: {args.dry_run}\n")

    all_stats = []
    t_total = time.time()

    for year in years:
        stats = process_year(year, args.workers, args.dry_run, args.chunk_size)
        all_stats.append(stats)
        print(f"  → Year {year}: {stats.citations_found:,} citations in {stats.elapsed_sec:.1f}s")
        print(f"    Types: {dict(stats.by_type)}\n")

    total_rows = sum(s.rows_processed for s in all_stats)
    total_cites = sum(s.citations_found for s in all_stats)
    total_time = time.time() - t_total

    print(f"\n=== Summary ===")
    print(f"Total rows: {total_rows:,}")
    print(f"Total citations: {total_cites:,}")
    print(f"Citations per decision: {total_cites/total_rows:.2f}" if total_rows else "N/A")
    print(f"Total time: {total_time:.1f}s ({total_time/3600:.1f}h)")

    type_totals = Counter()
    for s in all_stats:
        type_totals.update(s.by_type)
    print(f"\nBy type:")
    for t, c in type_totals.most_common():
        print(f"  {t}: {c:,}")

    # Save stats to JSON
    stats_file = f"citation-extraction-stats-{int(time.time())}.json"
    with open(stats_file, "w") as f:
        json.dump({
            "total_rows": total_rows,
            "total_citations": total_cites,
            "total_time_sec": total_time,
            "by_type": dict(type_totals),
            "by_year": [{
                "year": s.year,
                "rows": s.rows_processed,
                "citations": s.citations_found,
                "elapsed_sec": s.elapsed_sec,
                "types": dict(s.by_type),
            } for s in all_stats],
        }, f, indent=2)
    print(f"\nStats saved to {stats_file}")

if __name__ == "__main__":
    main()
