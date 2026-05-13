#!/usr/bin/env python3
"""
Citation Graph Paper — community detection and cross-domain analysis.

Experiment 4: Cross-domain bridging analysis
  Identifies "bridge articles" — legislation cited across multiple justice domains.

Experiment 5: Temporal ontology evolution via Louvain clustering
  Builds co-citation graphs per time period, detects communities, tracks evolution.

Usage:
  python3 analyze-communities.py --exp 4           # cross-domain only
  python3 analyze-communities.py --exp 5           # temporal clustering only
  python3 analyze-communities.py --all             # both experiments
  python3 analyze-communities.py --all --min-citations 100

Designed to run on prod (direct DB access). The co-citation self-join is expensive;
expect ~10-30 min per time period depending on data volume.
"""

import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras

# ── Database connection ──────────────────────────────────────

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:1xfXUY8y7DM8Sm1w6T2cmBnNsnzfgnNJ2Ajl1Zl11xc@127.0.0.1:5438/secondlayer_prod",
)

OUTPUT_DIR = Path(__file__).parent / "output"

JUSTICE_KIND_NAMES = {
    1: "civil",
    2: "criminal",
    3: "commercial",
    4: "administrative",
    5: "constitutional",
}

TIME_PERIODS = [
    ("2007-2010", 2007, 2010),
    ("2011-2014", 2011, 2014),
    ("2015-2018", 2015, 2018),
    ("2019-2022", 2019, 2022),
    ("2023-2026", 2023, 2026),
]


def get_conn():
    return psycopg2.connect(DB_DSN)


def ensure_output_dir():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ── Experiment 4: Cross-domain bridging analysis ─────────────


def run_experiment_4(min_citations: int):
    """Identify bridge articles cited significantly across multiple justice domains."""
    print("\n" + "=" * 70)
    print("EXPERIMENT 4: Cross-Domain Bridging Analysis")
    print("=" * 70)

    t0 = time.time()
    conn = get_conn()
    cur = conn.cursor()

    # Step 1: Build per-domain citation counts for each (law_number, law_article)
    print("\n[1/4] Counting per-domain citations (joining with edrsr_fulltext)...")

    cur.execute("""
        SELECT
            c.law_number,
            c.law_article,
            f.justice_kind,
            COUNT(*) AS cnt
        FROM law_court_citations c
        JOIN edrsr_fulltext f ON c.court_case_id = f.doc_id
        WHERE c.law_number IS NOT NULL
          AND c.law_number != ''
          AND c.law_article IS NOT NULL
          AND c.law_article != ''
          AND f.justice_kind IS NOT NULL
          AND f.justice_kind BETWEEN 1 AND 5
        GROUP BY c.law_number, c.law_article, f.justice_kind
    """)

    # Build nested dict: (law_number, law_article) -> {justice_kind: count}
    article_domain_counts = defaultdict(lambda: defaultdict(int))
    total_rows = 0
    for law_number, law_article, justice_kind, cnt in cur:
        article_domain_counts[(law_number, law_article)][justice_kind] += cnt
        total_rows += 1

    print(f"  Loaded {total_rows:,} (article, domain) pairs for "
          f"{len(article_domain_counts):,} unique articles")

    # Step 2: Compute total citations per article and identify bridge articles
    print("\n[2/4] Identifying bridge articles (>1000 citations in 3+ domains)...")

    article_stats = []
    for (law_number, law_article), domain_counts in article_domain_counts.items():
        total = sum(domain_counts.values())
        n_domains = len(domain_counts)
        article_stats.append({
            "law_number": law_number,
            "law_article": law_article,
            "total_citations": total,
            "n_domains": n_domains,
            "domain_counts": dict(domain_counts),
        })

    # Bridge articles: cited >1000 times across 3+ justice_kinds
    bridge_articles = [
        a for a in article_stats
        if a["total_citations"] > 1000 and a["n_domains"] >= 3
    ]

    # Sort by n_domains desc, then total_citations desc
    bridge_articles.sort(key=lambda a: (-a["n_domains"], -a["total_citations"]))

    print(f"  Total unique (law, article) pairs: {len(article_stats):,}")
    print(f"  Bridge articles (>1000 cites, 3+ domains): {len(bridge_articles):,}")

    # Step 3: Report top-30 bridge articles
    print("\n[3/4] Top-30 bridge articles:")
    print(f"  {'Rank':<5} {'Law':<45} {'Art':<8} {'Domains':<8} {'Total':<10} "
          f"{'Civil':<10} {'Crim':<10} {'Comm':<10} {'Admin':<10} {'Const':<10}")
    print("  " + "-" * 136)

    top30 = bridge_articles[:30]
    for i, a in enumerate(top30, 1):
        dc = a["domain_counts"]
        print(f"  {i:<5} {a['law_number'][:44]:<45} {a['law_article']:<8} "
              f"{a['n_domains']:<8} {a['total_citations']:<10,} "
              f"{dc.get(1, 0):<10,} {dc.get(2, 0):<10,} "
              f"{dc.get(3, 0):<10,} {dc.get(4, 0):<10,} "
              f"{dc.get(5, 0):<10,}")

    # Step 4: Compute bridge vs domain-specific fraction
    print("\n[4/4] Computing bridge vs domain-specific fractions...")

    bridge_set = set(
        (a["law_number"], a["law_article"]) for a in bridge_articles
    )
    total_all_citations = sum(a["total_citations"] for a in article_stats)
    bridge_citations = sum(
        a["total_citations"] for a in article_stats
        if (a["law_number"], a["law_article"]) in bridge_set
    )
    domain_specific_citations = total_all_citations - bridge_citations

    bridge_pct = (bridge_citations / total_all_citations * 100) if total_all_citations > 0 else 0
    domain_pct = (domain_specific_citations / total_all_citations * 100) if total_all_citations > 0 else 0

    print(f"  Total citations: {total_all_citations:,}")
    print(f"  Bridge article citations: {bridge_citations:,} ({bridge_pct:.1f}%)")
    print(f"  Domain-specific citations: {domain_specific_citations:,} ({domain_pct:.1f}%)")

    elapsed = time.time() - t0
    print(f"\n  Experiment 4 completed in {elapsed:.1f}s")

    # Save results
    results = {
        "experiment": 4,
        "description": "Cross-domain bridging analysis",
        "total_unique_articles": len(article_stats),
        "bridge_article_count": len(bridge_articles),
        "bridge_threshold_citations": 1000,
        "bridge_threshold_domains": 3,
        "total_citations": total_all_citations,
        "bridge_citations": bridge_citations,
        "bridge_fraction_pct": round(bridge_pct, 2),
        "domain_specific_citations": domain_specific_citations,
        "domain_specific_fraction_pct": round(domain_pct, 2),
        "top30_bridge_articles": [
            {
                "rank": i + 1,
                "law_number": a["law_number"],
                "law_article": a["law_article"],
                "total_citations": a["total_citations"],
                "n_domains": a["n_domains"],
                "domain_counts": {
                    JUSTICE_KIND_NAMES.get(k, str(k)): v
                    for k, v in sorted(a["domain_counts"].items())
                },
            }
            for i, a in enumerate(top30)
        ],
        "elapsed_sec": round(elapsed, 1),
    }

    ensure_output_dir()
    out_path = OUTPUT_DIR / "experiment4-bridge-articles.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"  Results saved to {out_path}")

    cur.close()
    conn.close()

    # Generate plot
    _plot_experiment_4(top30)

    return results


def _plot_experiment_4(top30: list[dict]):
    """Plot stacked bar chart of top-30 bridge articles by domain."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  [warn] matplotlib not available, skipping plot")
        return

    if not top30:
        return

    fig, ax = plt.subplots(figsize=(16, 10))

    labels = [f"{a['law_number'][:25]} ст.{a['law_article']}" for a in top30]
    x = np.arange(len(labels))
    width = 0.7

    domain_colors = {
        1: "#4e79a7",   # civil — blue
        2: "#e15759",   # criminal — red
        3: "#59a14f",   # commercial — green
        4: "#f28e2b",   # administrative — orange
        5: "#b07aa1",   # constitutional — purple
    }

    bottom = np.zeros(len(top30))
    for jk in [1, 2, 3, 4, 5]:
        values = [a["domain_counts"].get(jk, 0) for a in top30]
        ax.barh(x, values, width, left=bottom,
                label=JUSTICE_KIND_NAMES[jk],
                color=domain_colors[jk])
        bottom += np.array(values)

    ax.set_yticks(x)
    ax.set_yticklabels(labels, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("Citation count")
    ax.set_title("Top-30 Bridge Articles: Citations by Justice Domain")
    ax.legend(loc="lower right")
    plt.tight_layout()

    out_path = OUTPUT_DIR / "experiment4-bridge-articles.png"
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"  Plot saved to {out_path}")


# ── Experiment 5: Temporal Louvain clustering ────────────────


def run_experiment_5(min_citations: int):
    """Build co-citation graphs per time period, detect communities, track evolution."""
    import networkx as nx
    try:
        from community import community_louvain
    except ImportError:
        print("  [error] python-louvain not installed. Run: pip install python-louvain")
        sys.exit(1)

    try:
        from sklearn.metrics import normalized_mutual_info_score
    except ImportError:
        print("  [error] scikit-learn not installed. Run: pip install scikit-learn")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("EXPERIMENT 5: Temporal Ontology Evolution via Louvain Clustering")
    print(f"  min_citations = {min_citations}")
    print("=" * 70)

    t0_total = time.time()
    period_results = []
    period_partitions = {}  # label -> {article_key: community_id}

    for label, year_from, year_to in TIME_PERIODS:
        print(f"\n--- Period: {label} (years {year_from}-{year_to}) ---")
        t0 = time.time()

        conn = get_conn()
        cur = conn.cursor()

        # Step 1: Create temp table of articles with >= min_citations in this period
        print(f"  [1/4] Finding articles with >= {min_citations} citations...")
        cur.execute("""
            CREATE TEMP TABLE _freq_articles AS
            SELECT c.law_number, c.law_article, COUNT(*) AS total_cites
            FROM law_court_citations c
            JOIN edrsr_fulltext f ON c.court_case_id = f.doc_id
            WHERE f.adj_year BETWEEN %s AND %s
              AND c.law_number IS NOT NULL AND c.law_number != ''
              AND c.law_article IS NOT NULL AND c.law_article != ''
            GROUP BY c.law_number, c.law_article
            HAVING COUNT(*) >= %s
        """, (year_from, year_to, min_citations))

        cur.execute("SELECT COUNT(*) FROM _freq_articles")
        n_articles = cur.fetchone()[0]
        print(f"    {n_articles:,} articles with >= {min_citations} citations")

        if n_articles < 10:
            print(f"    Too few articles for clustering, skipping period")
            cur.execute("DROP TABLE IF EXISTS _freq_articles")
            cur.close()
            conn.close()
            period_results.append({
                "period": label,
                "n_articles": n_articles,
                "skipped": True,
            })
            continue

        # Step 2: Build co-citation edge list via SQL self-join
        print(f"  [2/4] Building co-citation graph (SQL self-join, may take minutes)...")

        cur.execute("""
            SELECT
                a.law_number AS law_a, a.law_article AS art_a,
                b.law_number AS law_b, b.law_article AS art_b,
                COUNT(DISTINCT a.court_case_id) AS weight
            FROM law_court_citations a
            JOIN law_court_citations b ON a.court_case_id = b.court_case_id
            JOIN edrsr_fulltext f ON a.court_case_id = f.doc_id
            JOIN _freq_articles fa ON a.law_number = fa.law_number AND a.law_article = fa.law_article
            JOIN _freq_articles fb ON b.law_number = fb.law_number AND b.law_article = fb.law_article
            WHERE f.adj_year BETWEEN %s AND %s
              AND (a.law_number < b.law_number
                   OR (a.law_number = b.law_number AND a.law_article < b.law_article))
            GROUP BY a.law_number, a.law_article, b.law_number, b.law_article
            HAVING COUNT(DISTINCT a.court_case_id) >= 10
        """, (year_from, year_to))

        edges = cur.fetchall()
        print(f"    {len(edges):,} co-citation edges (weight >= 10)")

        # Load article citation counts for labeling
        cur.execute("SELECT law_number, law_article, total_cites FROM _freq_articles")
        article_cites = {(r[0], r[1]): r[2] for r in cur.fetchall()}

        cur.execute("DROP TABLE IF EXISTS _freq_articles")
        cur.close()
        conn.close()

        if len(edges) < 5:
            print(f"    Too few edges for clustering, skipping period")
            period_results.append({
                "period": label,
                "n_articles": n_articles,
                "n_edges": len(edges),
                "skipped": True,
            })
            continue

        # Step 3: Build networkx graph and run Louvain
        print(f"  [3/4] Running Louvain community detection...")

        G = nx.Graph()
        for law_a, art_a, law_b, art_b, weight in edges:
            node_a = (law_a, art_a)
            node_b = (law_b, art_b)
            G.add_edge(node_a, node_b, weight=weight)

        # Add isolated frequent articles (no co-citation edges but still frequent)
        for key in article_cites:
            if key not in G:
                G.add_node(key)

        print(f"    Graph: {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges")

        partition = community_louvain.best_partition(G, weight="weight", random_state=42)
        modularity = community_louvain.modularity(partition, G, weight="weight")

        # Organize communities
        communities = defaultdict(list)
        for node, comm_id in partition.items():
            communities[comm_id].append(node)

        n_communities = len(communities)
        community_sizes = sorted(
            [(cid, len(members)) for cid, members in communities.items()],
            key=lambda x: -x[1],
        )

        print(f"    Communities: {n_communities}, Modularity: {modularity:.4f}")
        print(f"    Top-5 community sizes: {[s for _, s in community_sizes[:5]]}")

        # Step 4: Identify dominant law in top-5 communities
        print(f"  [4/4] Identifying dominant laws in top-5 communities...")

        top5_communities = []
        for rank, (cid, size) in enumerate(community_sizes[:5], 1):
            members = communities[cid]
            law_counter = Counter(node[0] for node in members)
            dominant_law, dominant_count = law_counter.most_common(1)[0]
            total_cites_in_comm = sum(article_cites.get(m, 0) for m in members)

            # Top-3 articles by citation count in this community
            top_articles = sorted(
                members,
                key=lambda m: article_cites.get(m, 0),
                reverse=True,
            )[:3]

            comm_info = {
                "rank": rank,
                "community_id": cid,
                "size": size,
                "dominant_law": dominant_law,
                "dominant_law_fraction": round(dominant_count / size, 3),
                "total_citations": total_cites_in_comm,
                "top_articles": [
                    {
                        "law_number": a[0],
                        "law_article": a[1],
                        "citations": article_cites.get(a, 0),
                    }
                    for a in top_articles
                ],
            }
            top5_communities.append(comm_info)

            print(f"    #{rank}: {size} articles, dominant={dominant_law[:50]} "
                  f"({dominant_count}/{size}={dominant_count/size:.0%}), "
                  f"total_cites={total_cites_in_comm:,}")

        elapsed = time.time() - t0
        print(f"  Period {label} completed in {elapsed:.1f}s")

        # Store partition for NMI computation
        period_partitions[label] = partition

        period_results.append({
            "period": label,
            "year_from": year_from,
            "year_to": year_to,
            "n_articles": n_articles,
            "n_edges": len(edges),
            "n_nodes": G.number_of_nodes(),
            "n_graph_edges": G.number_of_edges(),
            "n_communities": n_communities,
            "modularity": round(modularity, 4),
            "top5_community_sizes": [s for _, s in community_sizes[:5]],
            "top5_communities": top5_communities,
            "elapsed_sec": round(elapsed, 1),
            "skipped": False,
        })

    # ── NMI between adjacent periods ──
    print("\n--- NMI Between Adjacent Periods ---")

    nmi_results = []
    period_labels = [label for label, _, _ in TIME_PERIODS]

    for i in range(len(period_labels) - 1):
        label_a = period_labels[i]
        label_b = period_labels[i + 1]

        if label_a not in period_partitions or label_b not in period_partitions:
            print(f"  {label_a} -> {label_b}: skipped (missing partition data)")
            nmi_results.append({
                "period_a": label_a,
                "period_b": label_b,
                "nmi": None,
                "common_articles": 0,
            })
            continue

        part_a = period_partitions[label_a]
        part_b = period_partitions[label_b]

        # Find common articles
        common = set(part_a.keys()) & set(part_b.keys())
        if len(common) < 10:
            print(f"  {label_a} -> {label_b}: only {len(common)} common articles, skipping NMI")
            nmi_results.append({
                "period_a": label_a,
                "period_b": label_b,
                "nmi": None,
                "common_articles": len(common),
            })
            continue

        labels_a = [part_a[node] for node in common]
        labels_b = [part_b[node] for node in common]
        nmi = normalized_mutual_info_score(labels_a, labels_b)

        stability = "STABLE" if nmi > 0.5 else "CHANGED"
        print(f"  {label_a} -> {label_b}: NMI={nmi:.4f} ({len(common):,} common articles) [{stability}]")

        nmi_results.append({
            "period_a": label_a,
            "period_b": label_b,
            "nmi": round(nmi, 4),
            "common_articles": len(common),
            "stability": stability,
        })

    total_elapsed = time.time() - t0_total
    print(f"\nExperiment 5 completed in {total_elapsed:.1f}s")

    # Save results
    results = {
        "experiment": 5,
        "description": "Temporal ontology evolution via Louvain clustering",
        "min_citations": min_citations,
        "periods": period_results,
        "nmi_between_periods": nmi_results,
        "total_elapsed_sec": round(total_elapsed, 1),
    }

    ensure_output_dir()
    out_path = OUTPUT_DIR / "experiment5-temporal-communities.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"  Results saved to {out_path}")

    # Generate plots
    _plot_experiment_5(period_results, nmi_results)

    return results


def _plot_experiment_5(period_results: list[dict], nmi_results: list[dict]):
    """Plot temporal community evolution."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  [warn] matplotlib not available, skipping plots")
        return

    active_periods = [p for p in period_results if not p.get("skipped", True)]
    if len(active_periods) < 2:
        print("  [warn] Not enough periods for temporal plots")
        return

    fig, axes = plt.subplots(2, 2, figsize=(16, 12))

    # Plot 1: Number of communities over time
    ax = axes[0, 0]
    labels = [p["period"] for p in active_periods]
    n_comm = [p["n_communities"] for p in active_periods]
    ax.bar(labels, n_comm, color="#4e79a7")
    ax.set_title("Number of Communities per Period")
    ax.set_ylabel("Communities")
    for i, v in enumerate(n_comm):
        ax.text(i, v + 0.5, str(v), ha="center", fontsize=9)

    # Plot 2: Modularity over time
    ax = axes[0, 1]
    modularity = [p["modularity"] for p in active_periods]
    ax.plot(labels, modularity, "o-", color="#e15759", linewidth=2, markersize=8)
    ax.set_title("Modularity Score per Period")
    ax.set_ylabel("Modularity")
    ax.set_ylim(0, 1)
    for i, v in enumerate(modularity):
        ax.text(i, v + 0.02, f"{v:.3f}", ha="center", fontsize=9)

    # Plot 3: NMI between adjacent periods
    ax = axes[1, 0]
    nmi_active = [n for n in nmi_results if n["nmi"] is not None]
    if nmi_active:
        nmi_labels = [f"{n['period_a']}\n->\n{n['period_b']}" for n in nmi_active]
        nmi_values = [n["nmi"] for n in nmi_active]
        colors = ["#59a14f" if v > 0.5 else "#e15759" for v in nmi_values]
        ax.bar(nmi_labels, nmi_values, color=colors)
        ax.set_title("NMI Between Adjacent Periods")
        ax.set_ylabel("Normalized Mutual Information")
        ax.set_ylim(0, 1)
        ax.axhline(y=0.5, color="gray", linestyle="--", alpha=0.5, label="Stability threshold")
        ax.legend()
        for i, v in enumerate(nmi_values):
            ax.text(i, v + 0.02, f"{v:.3f}", ha="center", fontsize=9)
    else:
        ax.text(0.5, 0.5, "No NMI data available", ha="center", va="center",
                transform=ax.transAxes)

    # Plot 4: Top-5 community sizes stacked across periods
    ax = axes[1, 1]
    for p in active_periods:
        sizes = p.get("top5_community_sizes", [])[:5]
        while len(sizes) < 5:
            sizes.append(0)
        bottom = 0
        comm_colors = ["#4e79a7", "#e15759", "#59a14f", "#f28e2b", "#b07aa1"]
        for j, s in enumerate(sizes):
            ax.bar(p["period"], s, bottom=bottom, color=comm_colors[j],
                   label=f"Community {j+1}" if p == active_periods[0] else "")
            bottom += s
    ax.set_title("Top-5 Community Sizes per Period")
    ax.set_ylabel("Number of Articles")
    ax.legend(loc="upper right")

    plt.suptitle("Experiment 5: Temporal Ontology Evolution", fontsize=14, y=1.01)
    plt.tight_layout()

    out_path = OUTPUT_DIR / "experiment5-temporal-communities.png"
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Plot saved to {out_path}")


# ── Main ─────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Citation graph: community detection and cross-domain analysis"
    )
    parser.add_argument("--exp", type=int, choices=[4, 5],
                        help="Run a single experiment (4 or 5)")
    parser.add_argument("--all", action="store_true",
                        help="Run both experiments")
    parser.add_argument("--min-citations", type=int, default=50,
                        help="Min citations to include an article (default: 50)")
    args = parser.parse_args()

    if not args.exp and not args.all:
        parser.error("Specify --exp 4, --exp 5, or --all")

    print(f"=== Citation Graph: Community & Cross-Domain Analysis ===")
    print(f"Database: {DB_DSN.split('@')[1] if '@' in DB_DSN else DB_DSN}")
    print(f"Min citations: {args.min_citations}")
    print(f"Output: {OUTPUT_DIR}")

    ensure_output_dir()
    all_results = {}

    if args.all or args.exp == 4:
        all_results["experiment_4"] = run_experiment_4(args.min_citations)

    if args.all or args.exp == 5:
        all_results["experiment_5"] = run_experiment_5(args.min_citations)

    # Save combined results
    if args.all:
        out_path = OUTPUT_DIR / "experiments-4-5-combined.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        print(f"\nCombined results saved to {out_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
