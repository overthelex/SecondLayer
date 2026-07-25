#!/usr/bin/env python3
"""
Ukrainian-side bibliographic coupling / co-citation on the article-level
citation graph, matched to the Canadian (COLIEE) computation for the
cross-jurisdictional coupling paper.

Roles are mirrored from the Canadian graph:
  citing document  = court decision      (Canadian: query case)
  cited target     = legislation article (Canadian: noticed case)
  bibliographic coupling B = M M^T  -> decision pairs sharing cited articles
  co-citation        C = M^T M      -> article pairs co-cited by a decision

Full-scale decision coupling (100M nodes) is intractable and hub-dominated, so
we sample N decisions (default 2000, matched to the Canadian 2001 query cases)
via TABLESAMPLE with a fixed seed, fetch their complete article-edge sets, and
compute the matched statistics. Runs ON the prod host (reads prod Postgres
locally); prints a JSON stats blob to stdout (no bulk data egress).

Usage (on prod):
    UA_N=2000 python3 build_ua_coupling_sample.py
"""
import json
import os
import statistics
import sys
from collections import Counter, defaultdict

import psycopg2

N = int(os.environ.get("UA_N", "2000"))
SEED = int(os.environ.get("UA_SEED", "42"))
# optional justice_kind filter (4 = administrative = COLIEE-comparable domain)
JK = os.environ.get("JUSTICE_KIND")
JK = int(JK) if JK else None
# article-level citation types only (exclude supreme_court_ruling = case cites,
# and law_by_number = no article granularity)
ARTICLE_TYPES = ("codex_article", "law_article", "constitution",
                 "transitional_provision")


def main():
    conn = psycopg2.connect(
        host="127.0.0.1", port=int(os.environ.get("PGPORT", "5438")),
        user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ["POSTGRES_DB"])
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '180000'")

    jk_sql = " AND justice_kind = %s" if JK is not None else ""
    jk_arg = (JK,) if JK is not None else ()

    # 1. sample decisions (reproducible via REPEATABLE seed)
    cur.execute(
        f"""
        SELECT DISTINCT court_case_id
        FROM law_court_citations TABLESAMPLE SYSTEM (0.1) REPEATABLE (%s)
        WHERE citation_type = ANY(%s){jk_sql}
        LIMIT %s
        """,
        (SEED, list(ARTICLE_TYPES)) + jk_arg + (N,))
    decisions = [r[0] for r in cur.fetchall()]

    # 2. complete article-edge sets for the sampled decisions
    cur.execute(
        """
        SELECT court_case_id, citation_type, law_number, law_article
        FROM law_court_citations
        WHERE court_case_id = ANY(%s) AND citation_type = ANY(%s)
        """,
        (decisions, list(ARTICLE_TYPES)))
    dec_articles = defaultdict(set)
    for cid, ctype, lnum, lart in cur.fetchall():
        dec_articles[cid].add(f"{ctype}|{lnum}|{lart}")
    conn.close()

    dec_articles = {d: a for d, a in dec_articles.items() if a}
    stats = {"sample_decisions": len(dec_articles), "seed": SEED,
             "article_types": list(ARTICLE_TYPES)}

    # out-degree (articles per decision) -- mirrors CA citations-per-query
    degs = [len(a) for a in dec_articles.values()]
    stats["mean_articles_per_decision"] = round(statistics.mean(degs), 2)
    stats["median_articles_per_decision"] = statistics.median(degs)
    stats["max_articles_per_decision"] = max(degs)

    # bibliographic coupling: decision pairs sharing >= 1 article
    cited_by = defaultdict(list)          # article -> [decision ...]
    for d, arts in dec_articles.items():
        for a in arts:
            cited_by[a].append(d)
    coupling = Counter()
    for a, ds in cited_by.items():
        u = sorted(set(ds))
        for i in range(len(u)):
            for j in range(i + 1, len(u)):
                coupling[(u[i], u[j])] += 1
    stats["distinct_articles"] = len(cited_by)
    stats["coupling_pairs"] = len(coupling)
    if coupling:
        cv = list(coupling.values())
        stats["coupling_strength_mean"] = round(statistics.mean(cv), 3)
        stats["coupling_strength_max"] = max(cv)
        stats["coupling_strength_hist"] = [
            {"strength": s, "count": c} for s, c in sorted(Counter(cv).items())][:40]
    # coupling density among sampled decisions
    n = len(dec_articles)
    stats["coupling_density"] = round(len(coupling) / (n * (n - 1) / 2), 5) if n > 1 else 0

    # co-citation: article pairs co-cited by a common decision
    cocit = Counter()
    for d, arts in dec_articles.items():
        u = sorted(arts)
        for i in range(len(u)):
            for j in range(i + 1, len(u)):
                cocit[(u[i], u[j])] += 1
    stats["cocitation_pairs"] = len(cocit)
    if cocit:
        cc = list(cocit.values())
        stats["cocitation_strength_mean"] = round(statistics.mean(cc), 3)
        stats["cocitation_strength_max"] = max(cc)

    json.dump(stats, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
