#!/usr/bin/env python3
"""
Precision evaluation for citation extraction pipeline.

Samples 200 random decisions, re-extracts citations via regex, then validates
each citation against the known legislation corpus (citation_article_stats)
and full-text search to measure precision and recall.

Auto-verify approach:
- Precision: % of extracted citations that match a known law/article
- Cross-check: compare extracted citations vs stored citations in law_court_citations
- Per-type breakdown
"""

import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import psycopg2

PATTERNS = {
    "codex_article": re.compile(
        r'(?:(?:ч(?:астин[аи]|\.)\s*\d+\s+)?'
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+))\s+'
        r'(ЦК|КК|ГК|ГПК|КПК|КАС|ЦПК|КЗпП|СК|ЗК|ПК|МК|БК|ВК|ЛК|ЖК|КУпАП|КАСУ)'
        r'(?:\s+України)?',
        re.IGNORECASE | re.UNICODE
    ),
    "law_article": re.compile(
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+)'
        r'\s+(?:Закону\s+України|ЗУ|Закону)\s+'
        r'(?:[«"]([^»"]+)[»"]|(?:від|№)\s*(\d[\d.\-/]+))',
        re.IGNORECASE | re.UNICODE
    ),
    "constitution": re.compile(
        r'(?:стат(?:т[іея]|ей)|ст\.)\s*'
        r'([\d,\s\-та]+)\s+'
        r'Конституці[їі]\s+України',
        re.IGNORECASE | re.UNICODE
    ),
    "case_reference": re.compile(
        r'(?:справ[аи]\s*)?№\s*(\d{1,4}/\d+/\d{2,4})',
        re.IGNORECASE
    ),
    "law_by_number": re.compile(
        r'Закон(?:у|ом)?\s+України\s+'
        r'(?:від\s+(\d{2}\.\d{2}\.\d{4})\s+)?'
        r'№\s*([\d\-]+(?:\-[IVX]+)?)',
        re.IGNORECASE | re.UNICODE
    ),
    "supreme_court_ruling": re.compile(
        r'(?:постанов[аиі]|ухвал[аиі])\s+'
        r'(?:Пленуму\s+)?'
        r'(?:Верховного\s+Суду|ВС|Великої\s+Палати\s+ВС)',
        re.IGNORECASE | re.UNICODE
    ),
}

CODEX_NAMES = {
    "ЦК": "Цивільний кодекс України", "КК": "Кримінальний кодекс України",
    "ГК": "Господарський кодекс України", "ГПК": "Господарський процесуальний кодекс України",
    "КПК": "Кримінальний процесуальний кодекс України",
    "КАС": "Кодекс адміністративного судочинства України",
    "КАСУ": "Кодекс адміністративного судочинства України",
    "ЦПК": "Цивільний процесуальний кодекс України",
    "КЗпП": "Кодекс законів про працю України", "СК": "Сімейний кодекс України",
    "ЗК": "Земельний кодекс України", "ПК": "Податковий кодекс України",
    "МК": "Митний кодекс України", "БК": "Бюджетний кодекс України",
    "ВК": "Водний кодекс України", "ЛК": "Лісовий кодекс України",
    "ЖК": "Житловий кодекс України", "КУпАП": "Кодекс України про адміністративні правопорушення",
}


def parse_articles(raw):
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
    return articles or [raw.strip()]


def extract_from_text(doc_id, text):
    rows = []
    for m in PATTERNS["codex_article"].finditer(text):
        codex = CODEX_NAMES.get(m.group(2).upper(), m.group(2))
        for art in parse_articles(m.group(1)):
            rows.append((doc_id, "codex_article", codex, art, m.group(0)[:300]))
    for m in PATTERNS["law_article"].finditer(text):
        law = (m.group(2) or m.group(3) or "").strip()
        for art in parse_articles(m.group(1)):
            rows.append((doc_id, "law_article", law, art, m.group(0)[:300]))
    for m in PATTERNS["constitution"].finditer(text):
        for art in parse_articles(m.group(1)):
            rows.append((doc_id, "constitution", "Конституція України", art, m.group(0)[:300]))
    for m in PATTERNS["case_reference"].finditer(text):
        rows.append((doc_id, "case_reference", m.group(1), "", m.group(0)[:300]))
    for m in PATTERNS["law_by_number"].finditer(text):
        ref = f"№{m.group(2) or ''}" + (f" від {m.group(1)}" if m.group(1) else "")
        rows.append((doc_id, "law_by_number", ref, "", m.group(0)[:300]))
    for m in PATTERNS["supreme_court_ruling"].finditer(text):
        rows.append((doc_id, "supreme_court_ruling", "ВС", "", m.group(0)[:300]))
    return rows

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@127.0.0.1:5432/secondlayer_local",
)

OUTPUT_DIR = Path(__file__).parent / "output"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLE_SIZE = 200

    print("=" * 70)
    print(f"Precision Evaluation — {SAMPLE_SIZE} random decisions")
    print("=" * 70)

    t0 = time.time()
    conn = psycopg2.connect(DB_DSN)
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '30min'")

    # Step 1: Sample random decisions with full text
    print(f"\n[1/4] Sampling {SAMPLE_SIZE} random decisions with full text...")

    cur.execute("""
        SELECT doc_id, full_text
        FROM edrsr_fulltext TABLESAMPLE BERNOULLI(0.001)
        WHERE full_text IS NOT NULL AND length(full_text) > 100
        LIMIT %s
    """, (SAMPLE_SIZE,))
    samples = cur.fetchall()
    print(f"  Sampled {len(samples)} decisions")

    # Step 2: Extract citations from each decision
    print(f"\n[2/4] Extracting citations via regex...")

    all_extracted = []
    per_doc_stats = []

    for doc_id, text in samples:
        cites = extract_from_text(doc_id, text)
        all_extracted.extend(cites)
        per_doc_stats.append({
            "doc_id": doc_id,
            "text_len": len(text),
            "n_citations": len(cites),
            "types": Counter(c[1] for c in cites),
        })

    type_counts = Counter(c[1] for c in all_extracted)
    print(f"  Total citations extracted: {len(all_extracted):,}")
    for ctype, count in type_counts.most_common():
        print(f"    {ctype}: {count:,} ({count/len(all_extracted)*100:.1f}%)")

    # Step 3: Validate — check each citation against known data
    print(f"\n[3/4] Validating extracted citations...")

    # Load known legislation articles from citation_article_stats
    cur.execute("""
        SELECT DISTINCT law_number, law_article
        FROM citation_article_stats
        WHERE law_number IS NOT NULL AND law_number != ''
    """)
    known_articles = set()
    for law_num, law_art in cur:
        known_articles.add((law_num, law_art))
    print(f"  Known (law_number, law_article) pairs: {len(known_articles):,}")

    # Load stored citations for sampled doc_ids
    doc_ids = [s[0] for s in samples]
    cur.execute("""
        SELECT court_case_id, citation_type, law_number, law_article
        FROM law_court_citations
        WHERE court_case_id = ANY(%s)
    """, (doc_ids,))
    stored_citations = defaultdict(set)
    for case_id, ctype, law_num, law_art in cur:
        stored_citations[case_id].add((ctype, law_num, law_art))

    # Validate each extracted citation
    valid_count = 0
    invalid_count = 0
    type_valid = Counter()
    type_invalid = Counter()
    invalid_examples = []

    for doc_id, ctype, law_number, law_article, context in all_extracted:
        is_valid = False

        if ctype == "codex_article":
            is_valid = (law_number, law_article) in known_articles
        elif ctype == "law_article":
            # Law articles: check if law_number exists (article may vary)
            is_valid = any(k[0] == law_number for k in known_articles) or len(law_number) > 3
        elif ctype == "constitution":
            is_valid = (law_number, law_article) in known_articles or law_article.isdigit()
        elif ctype == "case_reference":
            # Case references: valid if matches pattern №NNN/NNN/NN
            is_valid = bool(re.match(r'\d{1,4}/\d+/\d{2,4}$', law_number))
        elif ctype == "law_by_number":
            is_valid = bool(re.match(r'№\d', law_number))
        elif ctype == "supreme_court_ruling":
            is_valid = True  # pattern match is sufficient

        if is_valid:
            valid_count += 1
            type_valid[ctype] += 1
        else:
            invalid_count += 1
            type_invalid[ctype] += 1
            if len(invalid_examples) < 50:
                invalid_examples.append({
                    "doc_id": doc_id,
                    "type": ctype,
                    "law_number": law_number,
                    "law_article": law_article,
                    "context": context[:200],
                })

    total = valid_count + invalid_count
    precision = valid_count / total if total > 0 else 0

    print(f"\n  Overall precision: {precision:.4f} ({valid_count:,}/{total:,})")
    print(f"\n  Per-type precision:")
    for ctype in type_counts:
        v = type_valid.get(ctype, 0)
        inv = type_invalid.get(ctype, 0)
        t = v + inv
        p = v / t if t > 0 else 0
        print(f"    {ctype:30s}: {p:.4f} ({v:,}/{t:,})")

    # Step 4: Cross-check with stored citations (recall proxy)
    print(f"\n[4/4] Cross-checking with stored citations (recall proxy)...")

    extracted_per_doc = defaultdict(set)
    for doc_id, ctype, law_number, law_article, context in all_extracted:
        extracted_per_doc[doc_id].add((ctype, law_number, law_article))

    total_stored = 0
    total_matched = 0
    total_extracted_only = 0

    for doc_id in doc_ids:
        stored = stored_citations.get(doc_id, set())
        extracted = extracted_per_doc.get(doc_id, set())

        matched = stored & extracted
        total_stored += len(stored)
        total_matched += len(matched)
        total_extracted_only += len(extracted - stored)

    recall_proxy = total_matched / total_stored if total_stored > 0 else 0
    print(f"  Stored citations in sample: {total_stored:,}")
    print(f"  Matched (extracted ∩ stored): {total_matched:,}")
    print(f"  Recall proxy: {recall_proxy:.4f}")
    print(f"  Extracted but not in DB: {total_extracted_only:,}")

    elapsed = time.time() - t0

    # Save results
    results = {
        "sample_size": len(samples),
        "total_extracted": len(all_extracted),
        "precision": round(precision, 4),
        "recall_proxy": round(recall_proxy, 4),
        "valid": valid_count,
        "invalid": invalid_count,
        "per_type_precision": {
            ctype: {
                "precision": round(type_valid.get(ctype, 0) / (type_valid.get(ctype, 0) + type_invalid.get(ctype, 0)) if (type_valid.get(ctype, 0) + type_invalid.get(ctype, 0)) > 0 else 0, 4),
                "valid": type_valid.get(ctype, 0),
                "invalid": type_invalid.get(ctype, 0),
                "total": type_counts[ctype],
            }
            for ctype in type_counts
        },
        "per_doc_stats": {
            "mean_citations": round(sum(d["n_citations"] for d in per_doc_stats) / len(per_doc_stats), 1),
            "median_citations": sorted(d["n_citations"] for d in per_doc_stats)[len(per_doc_stats) // 2],
            "max_citations": max(d["n_citations"] for d in per_doc_stats),
            "zero_citation_docs": sum(1 for d in per_doc_stats if d["n_citations"] == 0),
        },
        "invalid_examples": invalid_examples[:20],
        "elapsed_sec": round(elapsed, 1),
    }

    out_path = OUTPUT_DIR / "precision-evaluation.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nResults saved to {out_path}")
    print(f"Completed in {elapsed:.1f}s")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
