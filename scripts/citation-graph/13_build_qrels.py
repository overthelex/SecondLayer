#!/usr/bin/env python3
"""
Graded qrels from the citation graph for the EVAL-500K benchmark.

Relevance grades (query q, candidate d, both inside EVAL-500K):
  excluded  same cause_num as q (same case across instances - trivial near-dup)
  3         direct reference: q's case_reference set contains d.cause_num
            (or vice versa)
  2         strong co-citation: >= 3 shared IDF-informative article tokens
  1         weak co-citation: 1-2 shared informative tokens
  0         everything else (implicit)

"Informative" article tokens: document frequency within the sample in
[--min-df, --hub-frac * N]. Hub articles (ст. 129 Конституції etc.) carry no
relevance signal; df=1 tokens cannot create pairs.

Inputs:  output/eval500k/sample.csv  (from 12_sample_eval500k.py)
Outputs: output/eval500k/qrels.txt        TREC format: qid 0 doc_id grade
         output/eval500k/queries.csv      selected query docs + strata
         output/eval500k/excluded.txt     same-case pairs (qid doc_id)
         output/eval500k/qrels_stats.json

Usage:
  python3 13_build_qrels.py
  python3 13_build_qrels.py --num-queries 100 --min-relevant 3   # smoke
"""

import argparse
import csv
import json
import logging
import os
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval500k_common import (
    ARTICLE_CITATION_TYPES, DB_DSN, JUSTICE_KINDS, article_token, norm_cause_num,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("qrels")

OUTPUT_DIR = Path(__file__).parent / "output" / "eval500k"
SEED = 42

MAX_CANDIDATES_PER_QUERY = 1000


def load_sample(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    docs = {int(r["doc_id"]): r for r in rows}
    log.info("sample: %d docs", len(docs))
    return docs


def fetch_citations(doc_ids):
    """Per-doc article tokens and referenced case numbers."""
    doc_articles = defaultdict(set)
    doc_caserefs = defaultdict(set)
    conn = psycopg2.connect(DB_DSN)
    conn.set_session(readonly=True)
    ids = list(doc_ids)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '60min'")
        for i in range(0, len(ids), 10_000):
            cur.execute(
                """
                SELECT court_case_id, citation_type, law_number, law_article
                FROM law_court_citations
                WHERE court_case_id = ANY(%s)
                  AND citation_type = ANY(%s)
                """,
                (ids[i:i + 10_000], list(ARTICLE_CITATION_TYPES) + ["case_reference"]),
            )
            for doc_id, ctype, law_number, law_article in cur.fetchall():
                if ctype == "case_reference":
                    cn = norm_cause_num(law_number)
                    if cn:
                        doc_caserefs[doc_id].add(cn)
                else:
                    doc_articles[doc_id].add(article_token(law_number, law_article))
            if (i // 10_000) % 10 == 0:
                log.info("citations: %d/%d docs fetched", min(i + 10_000, len(ids)), len(ids))
    conn.close()
    log.info("citations: %d docs with articles, %d with case refs",
             len(doc_articles), len(doc_caserefs))
    return doc_articles, doc_caserefs


def informative_tokens(doc_articles, n_docs, min_df, hub_frac):
    df = Counter(t for toks in doc_articles.values() for t in toks)
    hub_cap = int(hub_frac * n_docs)
    keep = {t for t, c in df.items() if min_df <= c <= hub_cap}
    hubs = sorted(((t, c) for t, c in df.items() if c > hub_cap), key=lambda x: -x[1])
    log.info("tokens: %d total, %d informative (df in [%d, %d]); top hubs dropped: %s",
             len(df), len(keep), min_df, hub_cap,
             [f"{t} (df={c})" for t, c in hubs[:5]])
    return keep, {t: df[t] for t in keep}, hubs


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sample", default=str(OUTPUT_DIR / "sample.csv"))
    ap.add_argument("--num-queries", type=int, default=3_000)
    ap.add_argument("--min-relevant", type=int, default=5)
    ap.add_argument("--min-df", type=int, default=2)
    ap.add_argument("--hub-frac", type=float, default=0.0005,
                    help="drop tokens cited by more than this fraction of the sample")
    ap.add_argument("--strong-shared", type=int, default=3,
                    help="shared informative tokens for grade 2")
    ap.add_argument("--grade1-min", type=int, default=1,
                    help="min shared informative tokens for grade 1")
    args = ap.parse_args()

    rng = random.Random(SEED)
    docs = load_sample(args.sample)
    doc_articles, doc_caserefs = fetch_citations(docs.keys())

    keep, df, hubs = informative_tokens(doc_articles, len(docs), args.min_df, args.hub_frac)
    doc_tokens = {d: toks & keep for d, toks in doc_articles.items()}
    doc_tokens = {d: t for d, t in doc_tokens.items() if t}

    # inverted indexes inside the sample
    token_index = defaultdict(list)
    for d, toks in doc_tokens.items():
        for t in toks:
            token_index[t].append(d)
    cause_index = defaultdict(list)   # normalized cause_num -> doc_ids
    for d, meta in docs.items():
        cn = norm_cause_num(meta["cause_num"])
        if cn:
            cause_index[cn].append(d)

    def relevant_for(q):
        """(grade>=1 candidates dict, same-case exclusions set) for query q."""
        same_case = set(cause_index.get(norm_cause_num(docs[q]["cause_num"]), [])) - {q}
        shared = Counter()
        for t in doc_tokens.get(q, ()):
            for d in token_index[t]:
                if d != q:
                    shared[d] += 1
        grades = {}
        for d, n in shared.items():
            if d in same_case or n < args.grade1_min:
                continue
            grades[d] = 2 if n >= args.strong_shared else 1
        # direct references override co-citation grade
        q_cn = norm_cause_num(docs[q]["cause_num"])
        for cn in doc_caserefs.get(q, ()):
            for d in cause_index.get(cn, []):
                if d != q and d not in same_case:
                    grades[d] = 3
        for d, refs in (() if not q_cn else
                        ((d, doc_caserefs.get(d, ())) for d in list(grades))):
            if q_cn in refs:
                grades[d] = 3
        return grades, same_case

    # query selection: stratified over (year, kind) among eligible docs
    eligible = defaultdict(list)
    for d in doc_tokens:
        meta = docs[d]
        eligible[(meta["adj_year"], meta["justice_kind"])].append(d)
    for cell in eligible:
        rng.shuffle(eligible[cell])

    total_eligible = sum(len(v) for v in eligible.values())
    queries, qrels, excluded = [], {}, {}
    checked = 0
    for cell, pool in sorted(eligible.items()):
        quota = max(1, round(args.num_queries * len(pool) / total_eligible))
        taken = 0
        for q in pool:
            if taken >= quota or len(queries) >= args.num_queries:
                break
            grades, same_case = relevant_for(q)
            checked += 1
            if len(grades) < args.min_relevant:
                continue
            if len(grades) > MAX_CANDIDATES_PER_QUERY:
                top = sorted(grades.items(), key=lambda kv: -kv[1])[:MAX_CANDIDATES_PER_QUERY]
                log.warning("query %s: %d relevant truncated to %d",
                            q, len(grades), MAX_CANDIDATES_PER_QUERY)
                grades = dict(top)
            queries.append(q)
            qrels[q] = grades
            excluded[q] = same_case
            taken += 1
    log.info("queries: %d selected (checked %d candidates)", len(queries), checked)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DIR / "qrels.txt", "w") as f:
        for q in queries:
            for d, g in sorted(qrels[q].items(), key=lambda kv: -kv[1]):
                f.write(f"{q} 0 {d} {g}\n")
    with open(OUTPUT_DIR / "excluded.txt", "w") as f:
        for q in queries:
            for d in sorted(excluded[q]):
                f.write(f"{q} {d}\n")
    with open(OUTPUT_DIR / "queries.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["doc_id", "adj_year", "justice_kind", "judgment_code",
                    "n_relevant", "n_grade3", "n_grade2", "n_grade1", "n_excluded"])
        for q in queries:
            g = Counter(qrels[q].values())
            meta = docs[q]
            w.writerow([q, meta["adj_year"], meta["justice_kind"], meta["judgment_code"],
                        len(qrels[q]), g[3], g[2], g[1], len(excluded[q])])

    grade_totals = Counter(g for v in qrels.values() for g in v.values())
    stats = {
        "num_queries": len(queries),
        "params": {"min_relevant": args.min_relevant, "min_df": args.min_df,
                   "hub_frac": args.hub_frac, "strong_shared": args.strong_shared,
                   "grade1_min": args.grade1_min,
                   "max_candidates": MAX_CANDIDATES_PER_QUERY, "seed": SEED},
        "sample_docs": len(docs),
        "docs_with_informative_tokens": len(doc_tokens),
        "informative_tokens": len(keep),
        "dropped_hubs": [{"token": t, "df": c} for t, c in hubs[:50]],
        "grade_totals": {str(k): v for k, v in sorted(grade_totals.items(), reverse=True)},
        "avg_relevant_per_query": round(sum(len(v) for v in qrels.values()) / max(1, len(queries)), 1),
        "excluded_same_case_pairs": sum(len(v) for v in excluded.values()),
    }
    json.dump(stats, open(OUTPUT_DIR / "qrels_stats.json", "w"), indent=2, ensure_ascii=False)
    log.info("DONE: %s", json.dumps(stats["grade_totals"]))


if __name__ == "__main__":
    main()
