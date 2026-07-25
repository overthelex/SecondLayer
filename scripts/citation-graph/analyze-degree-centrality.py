#!/usr/bin/env python3
"""
Citation Graph Paper — degree centrality analysis of Ukrainian court citation network.

Two experiments:
  1. Power-law analysis of the degree distribution of cited legislation articles.
  2. PageRank and HITS centrality on the co-citation graph.

Requirements:
  pip install psycopg2-binary networkx powerlaw matplotlib scipy numpy

Usage:
  python3 analyze-degree-centrality.py                     # full dataset
  python3 analyze-degree-centrality.py --sample-size 500000  # test on subset

Output:
  scripts/citation-graph/output/  — plots and JSON results

Database:
  Reads from law_court_citations table via DATABASE_URL env var.
"""

import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import psycopg2
import psycopg2.extras

# ── Configuration ───────────────────────────────────────────────

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@127.0.0.1:5432/secondlayer_local",
)

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Minimum citations for an article to be included in the co-citation graph
CO_CITATION_THRESHOLD = 500

# ── Helpers ─────────────────────────────────────────────────────


def get_conn():
    """Return a psycopg2 connection with sensible defaults."""
    conn = psycopg2.connect(DB_DSN)
    conn.set_session(autocommit=True)
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '2h'")
    cur.close()
    return conn


def fmt_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes}m {secs:.0f}s"


def article_label(law_number: str, law_article: str) -> str:
    """Short human-readable label for a legislation article."""
    # Shorten common codex names for display
    shorts = {
        "Цивільний кодекс України": "ЦК",
        "Кримінальний кодекс України": "КК",
        "Господарський кодекс України": "ГК",
        "Господарський процесуальний кодекс України": "ГПК",
        "Кримінальний процесуальний кодекс України": "КПК",
        "Кодекс адміністративного судочинства України": "КАС",
        "Цивільний процесуальний кодекс України": "ЦПК",
        "Кодекс законів про працю України": "КЗпП",
        "Сімейний кодекс України": "СК",
        "Земельний кодекс України": "ЗК",
        "Податковий кодекс України": "ПК",
        "Митний кодекс України": "МК",
        "Бюджетний кодекс України": "БК",
        "Водний кодекс України": "ВК",
        "Лісовий кодекс України": "ЛК",
        "Житловий кодекс України": "ЖК",
        "Конституція України": "КУ",
    }
    short = shorts.get(law_number, law_number)
    # Truncate very long law names
    if len(short) > 40:
        short = short[:37] + "..."
    art = law_article if law_article else "?"
    return f"ст. {art} {short}"


# ── Experiment 1: Power-law analysis ───────────────────────────


def run_power_law_analysis(conn, sample_limit: int | None) -> dict[str, Any]:
    """
    Query degree distribution (how many court decisions cite each article)
    and fit power-law, lognormal, exponential distributions.
    """
    import powerlaw
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    print("\n" + "=" * 70)
    print("EXPERIMENT 1: Power-law analysis of citation degree distribution")
    print("=" * 70)

    t0 = time.time()

    # ── Step 1: Get degree distribution ──
    print("\n[1/4] Querying degree distribution...")

    # If sample_limit is set, we limit the number of rows read from the table
    # and then aggregate; otherwise we aggregate the entire table.
    if sample_limit:
        query = """
            SELECT law_number, law_article, COUNT(DISTINCT court_case_id) AS degree
            FROM (
                SELECT law_number, law_article, court_case_id
                FROM law_court_citations
                WHERE law_number IS NOT NULL
                  AND law_article IS NOT NULL
                LIMIT %s
            ) sub
            GROUP BY law_number, law_article
            ORDER BY degree DESC
        """
        params = (sample_limit,)
    else:
        query = """
            SELECT law_number, law_article, COUNT(DISTINCT court_case_id) AS degree
            FROM law_court_citations
            WHERE law_number IS NOT NULL
              AND law_article IS NOT NULL
            GROUP BY law_number, law_article
            ORDER BY degree DESC
        """
        params = None

    cur = conn.cursor()
    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()

    if not rows:
        print("ERROR: No citation data found. Is extraction still running?")
        return {"error": "no_data"}

    articles = [(r[0], r[1]) for r in rows]
    degrees = np.array([r[2] for r in rows], dtype=np.int64)

    total_articles = len(degrees)
    total_citations = int(degrees.sum())
    max_degree = int(degrees.max())
    median_degree = int(np.median(degrees))
    mean_degree = float(degrees.mean())

    print(f"    Unique (law_number, law_article) pairs: {total_articles:,}")
    print(f"    Total citation links: {total_citations:,}")
    print(f"    Max degree: {max_degree:,}")
    print(f"    Median degree: {median_degree:,}")
    print(f"    Mean degree: {mean_degree:,.1f}")
    print(f"    Query time: {fmt_duration(time.time() - t0)}")

    # Show top-20 most cited articles
    print("\n    Top-20 most cited articles:")
    for i in range(min(20, len(rows))):
        law, art = articles[i]
        label = article_label(law, art)
        print(f"      {i+1:3d}. {label:<45s}  {degrees[i]:>10,} decisions")

    # ── Step 2: Fit power law ──
    print("\n[2/4] Fitting power-law distribution...")

    # powerlaw library expects integer data; filter out zeros if any
    data = degrees[degrees > 0].astype(float)

    fit = powerlaw.Fit(data, discrete=True, verbose=False)

    alpha = fit.power_law.alpha
    xmin = fit.power_law.xmin
    sigma = fit.power_law.sigma  # standard error of alpha

    print(f"    alpha (exponent):    {alpha:.4f} +/- {sigma:.4f}")
    print(f"    xmin:                {xmin:.0f}")

    # KS distance
    try:
        ks_stat = fit.power_law.KS()
    except Exception:
        ks_stat = fit.Ds[-1] if hasattr(fit, 'Ds') and fit.Ds else 0.0
    print(f"    KS statistic (D):    {ks_stat:.6f}")

    # ── Step 3: Distribution comparison ──
    print("\n[3/4] Comparing power-law vs alternative distributions...")

    comparisons = {}

    for alt_name in ["lognormal", "exponential", "stretched_exponential", "truncated_power_law"]:
        try:
            R, p = fit.distribution_compare("power_law", alt_name, normalized_ratio=True)
            direction = "power_law" if R > 0 else alt_name
            comparisons[alt_name] = {
                "loglikelihood_ratio": float(R),
                "p_value": float(p),
                "favored": direction,
            }
            print(f"    power_law vs {alt_name:<25s}  R={R:+.4f}  p={p:.4f}  => {direction}")
        except Exception as e:
            print(f"    power_law vs {alt_name:<25s}  FAILED: {e}")
            comparisons[alt_name] = {"error": str(e)}

    # ── Step 4: Comparison with known values ──
    print("\n[4/4] Comparison with known citation network exponents:")
    print(f"    Ukrainian court decisions (this study):  alpha = {alpha:.2f}")
    print(f"    US Supreme Court (Fowler et al., 2007):  alpha ~ 2.1")
    print(f"    Indian Supreme Court (Kumar et al.):     alpha ~ 1.8")
    print(f"    EU Court of Justice (Mirshahvalad):      alpha ~ 1.7")
    print(f"    Random network (Erdos-Renyi):            alpha = N/A (Poisson)")

    if alpha > 2.5:
        interpretation = "steeper than typical; highly concentrated around few articles"
    elif alpha > 2.0:
        interpretation = "comparable to Fowler US Supreme Court network"
    elif alpha > 1.5:
        interpretation = "comparable to Kumar Indian / EU networks"
    else:
        interpretation = "unusually flat; very broad citation spread"
    print(f"\n    Interpretation: {interpretation}")

    # ── Plot: log-log degree distribution with power-law fit ──
    print("\n    Saving log-log plot...")

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Left panel: PDF
    ax1 = axes[0]
    fit.plot_pdf(ax=ax1, color="steelblue", linewidth=0, marker="o", markersize=3, label="Empirical PDF")
    fit.power_law.plot_pdf(ax=ax1, color="crimson", linestyle="--", linewidth=2,
                           label=f"Power law (alpha={alpha:.2f}, xmin={xmin:.0f})")
    try:
        fit.lognormal.plot_pdf(ax=ax1, color="green", linestyle=":", linewidth=2, label="Lognormal fit")
    except Exception:
        pass
    ax1.set_xlabel("Degree (number of citing decisions)", fontsize=12)
    ax1.set_ylabel("P(k)", fontsize=12)
    ax1.set_title("Degree Distribution — PDF", fontsize=13)
    ax1.legend(fontsize=9)

    # Right panel: CCDF
    ax2 = axes[1]
    fit.plot_ccdf(ax=ax2, color="steelblue", linewidth=0, marker="o", markersize=3, label="Empirical CCDF")
    fit.power_law.plot_ccdf(ax=ax2, color="crimson", linestyle="--", linewidth=2,
                            label=f"Power law (alpha={alpha:.2f})")
    try:
        fit.lognormal.plot_ccdf(ax=ax2, color="green", linestyle=":", linewidth=2, label="Lognormal fit")
    except Exception:
        pass
    ax2.set_xlabel("Degree (number of citing decisions)", fontsize=12)
    ax2.set_ylabel("P(K >= k)", fontsize=12)
    ax2.set_title("Degree Distribution — CCDF", fontsize=13)
    ax2.legend(fontsize=9)

    fig.suptitle("Ukrainian Court Citation Network — Degree Distribution", fontsize=15, fontweight="bold")
    plt.tight_layout()

    plot_path = OUTPUT_DIR / "degree_distribution_powerlaw.png"
    fig.savefig(plot_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(f"    Saved: {plot_path}")

    elapsed = time.time() - t0
    print(f"\n    Experiment 1 completed in {fmt_duration(elapsed)}")

    return {
        "total_unique_articles": total_articles,
        "total_citation_links": total_citations,
        "max_degree": max_degree,
        "median_degree": median_degree,
        "mean_degree": round(mean_degree, 2),
        "power_law": {
            "alpha": round(alpha, 4),
            "alpha_stderr": round(sigma, 4),
            "xmin": float(xmin),
            "ks_statistic": round(ks_stat, 6),
        },
        "distribution_comparisons": comparisons,
        "reference_exponents": {
            "ukraine_this_study": round(alpha, 2),
            "us_supreme_court_fowler": 2.1,
            "india_kumar": 1.8,
            "eu_court_mirshahvalad": 1.7,
        },
        "interpretation": interpretation,
        "top_20_articles": [
            {
                "rank": i + 1,
                "law_number": articles[i][0],
                "law_article": articles[i][1],
                "label": article_label(articles[i][0], articles[i][1]),
                "degree": int(degrees[i]),
            }
            for i in range(min(20, len(rows)))
        ],
        "elapsed_seconds": round(elapsed, 1),
    }


# ── Experiment 2: PageRank and HITS centrality ─────────────────


def run_centrality_analysis(conn, sample_limit: int | None) -> dict[str, Any]:
    """
    Build co-citation graph of legislation articles, compute PageRank and HITS.
    Two articles share an edge if they are cited in the same court decision.

    Note: sample_limit is accepted for API compatibility but ignored — this
    function uses pre-aggregated citation_article_stats for Step 1 and a
    filtered self-join for Step 2, so sampling is unnecessary.
    """
    import networkx as nx
    from scipy.stats import spearmanr
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    print("\n" + "=" * 70)
    print("EXPERIMENT 2: PageRank and HITS centrality on co-citation graph")
    print("=" * 70)

    t0 = time.time()

    # ── Step 1: Find articles cited by >= CO_CITATION_THRESHOLD decisions ──
    # Uses pre-aggregated citation_article_stats (37M rows) instead of
    # raw law_court_citations (502M rows).
    print(f"\n[1/5] Finding articles with >= {CO_CITATION_THRESHOLD} citing decisions "
          f"(via citation_article_stats)...")

    cur = conn.cursor()

    # citation_article_stats has per-(law_number, law_article, citation_type) rows.
    # Sum unique_decisions across citation_types and filter by threshold.
    query_articles = f"""
        SELECT law_number, law_article, SUM(unique_decisions) AS degree
        FROM citation_article_stats
        WHERE law_number IS NOT NULL
          AND law_article IS NOT NULL
        GROUP BY law_number, law_article
        HAVING SUM(unique_decisions) >= {CO_CITATION_THRESHOLD}
        ORDER BY degree DESC
    """
    cur.execute(query_articles)

    article_rows = cur.fetchall()

    if len(article_rows) < 2:
        print(f"ERROR: Only {len(article_rows)} articles meet the threshold. "
              f"Need at least 2 for a graph. Try lowering CO_CITATION_THRESHOLD or running more extraction.")
        cur.close()
        return {"error": "insufficient_articles", "count": len(article_rows)}

    # Map article keys to degree counts
    article_keys = set()
    raw_degree = {}
    for law_num, law_art, degree in article_rows:
        key = (law_num, law_art)
        article_keys.add(key)
        raw_degree[key] = int(degree)

    print(f"    Articles above threshold: {len(article_keys):,}")
    print(f"    Query time: {fmt_duration(time.time() - t0)}")

    # ── Step 2: Load co-citation edges from pre-built table ──
    # Uses the materialized `cocitation_edges` table (built once from _lcc_freq
    # self-join) instead of running the expensive self-join inline.
    print("\n[2/5] Loading co-citation graph from cocitation_edges table...")
    t1 = time.time()

    cur = conn.cursor()
    cur.execute("""
        SELECT law_a, art_a, law_b, art_b, weight
        FROM cocitation_edges
        WHERE weight >= 10
    """)

    edge_weights: Counter = Counter()
    rows_fetched = 0

    batch_size = 100000
    while True:
        batch = cur.fetchmany(batch_size)
        if not batch:
            break
        for law_a, art_a, law_b, art_b, weight in batch:
            key_a = (law_a, art_a)
            key_b = (law_b, art_b)
            if key_a in article_keys and key_b in article_keys:
                edge_weights[(key_a, key_b)] = int(weight)
            rows_fetched += 1
        if rows_fetched % 500000 == 0:
            print(f"      ... fetched {rows_fetched:,} edge rows so far")

    cur.close()

    print(f"    Total edges in table: {rows_fetched:,}")
    print(f"    Edges matching threshold articles: {len(edge_weights):,}")
    print(f"    Load time: {fmt_duration(time.time() - t1)}")

    if not edge_weights:
        print("ERROR: No co-citation edges found. Articles may not co-occur in any decision.")
        return {"error": "no_edges"}

    # ── Step 3: Build networkit graph and compute centrality ──
    # networkit is C++-backed and 10-100x faster than NetworkX for PageRank/HITS
    import networkit as nk

    print("\n[3/5] Computing PageRank and HITS (via networkit)...")
    t2 = time.time()

    # Build node mapping: article_key -> int index
    edge_nodes = set()
    for (a1, a2) in edge_weights.keys():
        edge_nodes.add(a1)
        edge_nodes.add(a2)

    node_list = sorted(edge_nodes)
    key_to_idx = {k: i for i, k in enumerate(node_list)}
    idx_to_key = {i: k for k, i in key_to_idx.items()}
    n = len(node_list)

    G = nk.Graph(n, weighted=True)
    for (a1, a2), weight in edge_weights.items():
        G.addEdge(key_to_idx[a1], key_to_idx[a2], weight)

    print(f"    Graph: {G.numberOfNodes()} nodes, {G.numberOfEdges()} edges")

    # PageRank (weighted)
    print("    Computing PageRank...")
    pr = nk.centrality.PageRank(G, tol=1e-8)
    pr.run()
    pagerank = {idx_to_key[i]: pr.score(i) for i in range(n)}

    # HITS — networkit doesn't have HITS directly, use eigenvector centrality
    # as a proxy (for undirected graphs, authority ≈ eigenvector centrality)
    print("    Computing Eigenvector Centrality (HITS proxy)...")
    ev = nk.centrality.EigenvectorCentrality(G, tol=1e-8)
    ev.run()
    authorities = {idx_to_key[i]: ev.score(i) for i in range(n)}
    hubs = authorities  # symmetric for undirected graphs

    elapsed_centrality = time.time() - t2
    print(f"    Centrality computation time: {fmt_duration(elapsed_centrality)}")

    # ── Step 4: Rankings and comparison ──
    print("\n[4/5] Building rankings and computing correlations...")

    # Get all nodes in the graph (using mapped keys, not networkit graph)
    nodes = node_list

    # Rank by raw citation count
    by_degree = sorted(nodes, key=lambda n: raw_degree.get(n, 0), reverse=True)

    # Rank by PageRank
    by_pagerank = sorted(nodes, key=lambda n: pagerank.get(n, 0), reverse=True)

    # Rank by authority score
    by_authority = sorted(nodes, key=lambda n: authorities.get(n, 0), reverse=True)

    top_n = min(50, len(nodes))

    # Print top-50 tables
    print(f"\n    Top-{top_n} by RAW CITATION COUNT:")
    for i in range(top_n):
        key = by_degree[i]
        label = article_label(key[0], key[1])
        pr = pagerank.get(key, 0)
        auth = authorities.get(key, 0)
        print(f"      {i+1:3d}. {label:<50s}  deg={raw_degree[key]:>10,}  PR={pr:.6f}  auth={auth:.6f}")

    print(f"\n    Top-{top_n} by PAGERANK:")
    for i in range(top_n):
        key = by_pagerank[i]
        label = article_label(key[0], key[1])
        pr = pagerank.get(key, 0)
        deg = raw_degree.get(key, 0)
        print(f"      {i+1:3d}. {label:<50s}  PR={pr:.6f}  deg={deg:>10,}")

    print(f"\n    Top-{top_n} by AUTHORITY SCORE (HITS):")
    for i in range(top_n):
        key = by_authority[i]
        label = article_label(key[0], key[1])
        auth = authorities.get(key, 0)
        hub = hubs.get(key, 0)
        deg = raw_degree.get(key, 0)
        print(f"      {i+1:3d}. {label:<50s}  auth={auth:.6f}  hub={hub:.6f}  deg={deg:>10,}")

    # Spearman rank correlations
    # Build rank arrays for all nodes
    degree_ranks = {n: rank for rank, n in enumerate(by_degree)}
    pr_ranks = {n: rank for rank, n in enumerate(by_pagerank)}
    auth_ranks = {n: rank for rank, n in enumerate(by_authority)}

    deg_arr = np.array([degree_ranks[n] for n in nodes])
    pr_arr = np.array([pr_ranks[n] for n in nodes])
    auth_arr = np.array([auth_ranks[n] for n in nodes])

    rho_deg_pr, p_deg_pr = spearmanr(deg_arr, pr_arr)
    rho_deg_auth, p_deg_auth = spearmanr(deg_arr, auth_arr)
    rho_pr_auth, p_pr_auth = spearmanr(pr_arr, auth_arr)

    print(f"\n    Spearman rank correlations (N={len(nodes)}):")
    print(f"      Degree vs PageRank:   rho={rho_deg_pr:.4f}  p={p_deg_pr:.2e}")
    print(f"      Degree vs Authority:  rho={rho_deg_auth:.4f}  p={p_deg_auth:.2e}")
    print(f"      PageRank vs Authority: rho={rho_pr_auth:.4f}  p={p_pr_auth:.2e}")

    if rho_deg_pr > 0.9:
        corr_interpretation = ("PageRank and raw degree are highly correlated (rho > 0.9), "
                               "suggesting simple citation frequency is a good proxy for centrality "
                               "in this network.")
    elif rho_deg_pr > 0.7:
        corr_interpretation = ("PageRank and raw degree are moderately correlated, "
                               "indicating that co-citation structure adds information beyond "
                               "simple frequency.")
    else:
        corr_interpretation = ("PageRank and raw degree diverge substantially, "
                               "suggesting rich co-citation structure where frequently cited articles "
                               "are not necessarily the most central.")

    print(f"\n    Interpretation: {corr_interpretation}")

    # ── Step 5: Plots ──
    print("\n[5/5] Saving plots...")

    # Plot 1: PageRank vs Degree scatter
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))

    pr_values = [pagerank.get(n, 0) for n in nodes]
    deg_values = [raw_degree.get(n, 0) for n in nodes]
    auth_values = [authorities.get(n, 0) for n in nodes]

    ax1 = axes[0]
    ax1.scatter(deg_values, pr_values, alpha=0.4, s=8, color="steelblue")
    ax1.set_xlabel("Raw Citation Count", fontsize=11)
    ax1.set_ylabel("PageRank", fontsize=11)
    ax1.set_title(f"Degree vs PageRank (rho={rho_deg_pr:.3f})", fontsize=12)
    ax1.set_xscale("log")
    ax1.set_yscale("log")

    ax2 = axes[1]
    ax2.scatter(deg_values, auth_values, alpha=0.4, s=8, color="darkorange")
    ax2.set_xlabel("Raw Citation Count", fontsize=11)
    ax2.set_ylabel("Authority Score (HITS)", fontsize=11)
    ax2.set_title(f"Degree vs Authority (rho={rho_deg_auth:.3f})", fontsize=12)
    ax2.set_xscale("log")
    ax2.set_yscale("log")

    ax3 = axes[2]
    ax3.scatter(pr_values, auth_values, alpha=0.4, s=8, color="forestgreen")
    ax3.set_xlabel("PageRank", fontsize=11)
    ax3.set_ylabel("Authority Score (HITS)", fontsize=11)
    ax3.set_title(f"PageRank vs Authority (rho={rho_pr_auth:.3f})", fontsize=12)
    ax3.set_xscale("log")
    ax3.set_yscale("log")

    fig.suptitle("Centrality Measure Correlations — Ukrainian Court Citation Network",
                 fontsize=14, fontweight="bold")
    plt.tight_layout()

    scatter_path = OUTPUT_DIR / "centrality_correlations.png"
    fig.savefig(scatter_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(f"    Saved: {scatter_path}")

    # Plot 2: Top-30 articles bar chart (3 measures side by side)
    fig, axes = plt.subplots(3, 1, figsize=(16, 18))

    top_30 = min(30, len(nodes))

    # By degree
    ax = axes[0]
    labels_deg = [article_label(by_degree[i][0], by_degree[i][1]) for i in range(top_30)]
    vals_deg = [raw_degree[by_degree[i]] for i in range(top_30)]
    y_pos = np.arange(top_30)
    ax.barh(y_pos, vals_deg, color="steelblue", height=0.7)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels_deg, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("Number of Citing Decisions")
    ax.set_title("Top Articles by Raw Citation Count", fontsize=13, fontweight="bold")

    # By PageRank
    ax = axes[1]
    labels_pr = [article_label(by_pagerank[i][0], by_pagerank[i][1]) for i in range(top_30)]
    vals_pr = [pagerank[by_pagerank[i]] for i in range(top_30)]
    ax.barh(y_pos, vals_pr, color="crimson", height=0.7)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels_pr, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("PageRank Score")
    ax.set_title("Top Articles by PageRank", fontsize=13, fontweight="bold")

    # By Authority
    ax = axes[2]
    labels_auth = [article_label(by_authority[i][0], by_authority[i][1]) for i in range(top_30)]
    vals_auth = [authorities[by_authority[i]] for i in range(top_30)]
    ax.barh(y_pos, vals_auth, color="darkorange", height=0.7)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels_auth, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("HITS Authority Score")
    ax.set_title("Top Articles by HITS Authority", fontsize=13, fontweight="bold")

    fig.suptitle("Top-30 Legislation Articles by Three Centrality Measures",
                 fontsize=15, fontweight="bold")
    plt.tight_layout()

    bar_path = OUTPUT_DIR / "top_articles_centrality.png"
    fig.savefig(bar_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(f"    Saved: {bar_path}")

    elapsed = time.time() - t0
    print(f"\n    Experiment 2 completed in {fmt_duration(elapsed)}")

    # Build results
    def top_list(ranked, score_fn, score_name, n=50):
        return [
            {
                "rank": i + 1,
                "law_number": ranked[i][0],
                "law_article": ranked[i][1],
                "label": article_label(ranked[i][0], ranked[i][1]),
                score_name: round(float(score_fn(ranked[i])), 8),
                "degree": int(raw_degree.get(ranked[i], 0)),
            }
            for i in range(min(n, len(ranked)))
        ]

    return {
        "graph": {
            "nodes": G.numberOfNodes(),
            "edges": G.numberOfEdges(),
            "co_citation_threshold": CO_CITATION_THRESHOLD,
            "isolated_removed": len(article_keys) - n,
            "co_citation_edges_from_sql": len(edge_weights),
        },
        "top_50_by_degree": top_list(by_degree, lambda n: raw_degree.get(n, 0), "degree"),
        "top_50_by_pagerank": top_list(by_pagerank, lambda n: pagerank.get(n, 0), "pagerank"),
        "top_50_by_authority": top_list(by_authority, lambda n: authorities.get(n, 0), "authority"),
        "spearman_correlations": {
            "degree_vs_pagerank": {"rho": round(rho_deg_pr, 4), "p_value": float(p_deg_pr)},
            "degree_vs_authority": {"rho": round(rho_deg_auth, 4), "p_value": float(p_deg_auth)},
            "pagerank_vs_authority": {"rho": round(rho_pr_auth, 4), "p_value": float(p_pr_auth)},
        },
        "interpretation": corr_interpretation,
        "elapsed_seconds": round(elapsed, 1),
    }


# ── Main ────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Citation graph degree centrality analysis for Ukrainian court decisions."
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Limit the number of citation rows to process (default: all). "
             "Useful for quick testing on a subset.",
    )
    parser.add_argument("--skip-exp1", action="store_true", help="Skip Experiment 1 (power-law)")
    args = parser.parse_args()

    sample_desc = f"{args.sample_size:,} rows" if args.sample_size else "all data"
    print(f"Citation Graph — Degree Centrality Analysis")
    print(f"Dataset: {sample_desc}")
    print(f"Database: {DB_DSN.split('@')[1] if '@' in DB_DSN else DB_DSN}")
    print(f"Output: {OUTPUT_DIR}")

    # ── Check connectivity and table existence ──
    print("\nConnecting to database...")
    try:
        conn = get_conn()
    except Exception as e:
        print(f"ERROR: Cannot connect to database: {e}")
        print("Set DATABASE_URL environment variable or check connection parameters.")
        sys.exit(1)

    cur = conn.cursor()

    # Check table exists
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'law_court_citations'
        )
    """)
    if not cur.fetchone()[0]:
        print("ERROR: Table law_court_citations does not exist.")
        print("Run extract-citations.py first to populate citation data.")
        sys.exit(1)

    # Get row count estimate (fast)
    cur.execute("SELECT reltuples::bigint FROM pg_class WHERE relname = 'law_court_citations'")
    row_estimate = cur.fetchone()
    est_rows = row_estimate[0] if row_estimate else 0
    print(f"Table law_court_citations: ~{est_rows:,} rows (estimated)")

    # Get exact count of distinct court cases (might be slow on huge tables)
    cur.execute("SELECT COUNT(*) FROM law_court_citations")
    exact_rows = cur.fetchone()[0]
    print(f"Table law_court_citations: {exact_rows:,} rows (exact)")

    cur.close()

    if exact_rows == 0:
        print("ERROR: Table is empty. Run extract-citations.py first.")
        sys.exit(1)

    if args.sample_size and args.sample_size > exact_rows:
        print(f"NOTE: --sample-size {args.sample_size:,} exceeds table size {exact_rows:,}, "
              f"using all data.")
        args.sample_size = None

    # ── Run experiments ──
    t_total = time.time()

    if not hasattr(args, 'skip_exp1') or not args.skip_exp1:
        exp1_results = run_power_law_analysis(conn, args.sample_size)
    else:
        exp1_results = {"skipped": True}
        print("Skipping Experiment 1 (--skip-exp1)")
    exp2_results = run_centrality_analysis(conn, args.sample_size)

    conn.close()

    # ── Save combined results ──
    results = {
        "metadata": {
            "dataset": sample_desc,
            "table_rows": exact_rows,
            "co_citation_threshold": CO_CITATION_THRESHOLD,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        },
        "experiment_1_power_law": exp1_results,
        "experiment_2_centrality": exp2_results,
    }

    json_path = OUTPUT_DIR / "centrality_analysis_results.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to: {json_path}")

    total_elapsed = time.time() - t_total
    print(f"\nTotal analysis time: {fmt_duration(total_elapsed)}")
    print("Done.")


if __name__ == "__main__":
    main()
