#!/usr/bin/env python3
"""
Citation Graph Paper — Temporal dynamics analysis.

Experiment 3: Legislative regime change detection
  - Track codex citation density per year, detect regime transitions (>30% YoY change)
  - Plot normalized citation trends for major codexes

Experiment 7: Impact of 2022 war on court decision patterns
  - Decisions per year (showing 2022 drop)
  - Citation entropy per year (concentration vs dispersion)
  - Top-20 cited articles comparison: 2021 vs 2023
  - New post-war legislation detection

Usage:
  python3 analyze-temporal-dynamics.py
  python3 analyze-temporal-dynamics.py --year-from 2010 --year-to 2025
  python3 analyze-temporal-dynamics.py --experiment 3   # run only Experiment 3
  python3 analyze-temporal-dynamics.py --experiment 7   # run only Experiment 7

Dependencies: psycopg2, matplotlib, numpy, scipy
Output: plots to scripts/citation-graph/output/, stats to JSON
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
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from scipy import stats as scipy_stats

# ── Configuration ───────────────────────────────────────────

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@127.0.0.1:5432/secondlayer_local",
)

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "output"

# Major codexes to track (short abbreviation -> citation law_number substring)
CODEX_MAP = {
    "ЦК": "Цивільний кодекс",
    "КК": "Кримінальний кодекс",
    "ГК": "Господарський кодекс",
    "ГПК": "Господарський процесуальний кодекс",
    "КПК": "Кримінальний процесуальний кодекс",
    "КАС": "Кодекс адміністративного судочинства",
    "ЦПК": "Цивільний процесуальний кодекс",
}

# Known regime transition years for annotation
KNOWN_TRANSITIONS = {
    "ЦК": [(2004, "Новий ЦК 2003")],
    "КПК": [(2013, "Новий КПК 2012")],
    "КАС": [(2005, "КАС набув чинності"), (2018, "Реформа КАС 2017")],
    "ГПК": [(2018, "Реформа ГПК 2017")],
    "ЦПК": [(2018, "Реформа ЦПК 2017")],
}

REGIME_CHANGE_THRESHOLD = 0.30  # 30% YoY change flags a regime transition

# Plot styling
plt.rcParams.update({
    "figure.dpi": 150,
    "savefig.dpi": 150,
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.labelsize": 11,
    "legend.fontsize": 8,
    "figure.facecolor": "white",
})


def get_conn():
    return psycopg2.connect(DB_DSN)


# ── Experiment 3: Legislative regime change detection ───────

def exp3_fetch_codex_citations_per_year(conn, year_from: int, year_to: int) -> dict:
    """
    For each major codex, count citations per year.
    Uses pre-aggregated citation_year_stats table.
    Returns: {codex_abbr: {year: count}}
    """
    cur = conn.cursor()

    # Build CASE expression for codex classification
    when_clauses = []
    ilike_conditions = []
    for abbr, name_fragment in CODEX_MAP.items():
        when_clauses.append(f"WHEN law_number ILIKE '%%{name_fragment}%%' THEN '{abbr}'")
        ilike_conditions.append(f"law_number ILIKE '%%{name_fragment}%%'")
    case_expr = "CASE " + " ".join(when_clauses) + " END"
    where_ilike = " OR ".join(ilike_conditions)

    query = f"""
        SELECT
            {case_expr} AS codex,
            year,
            SUM(citations) AS cnt
        FROM citation_year_stats
        WHERE citation_type = 'codex_article'
          AND year BETWEEN %s AND %s
          AND ({where_ilike})
        GROUP BY codex, year
        ORDER BY codex, year
    """
    print("  Fetching codex citations per year (from citation_year_stats)...")
    t0 = time.time()
    cur.execute(query, (year_from, year_to))
    rows = cur.fetchall()
    print(f"  Got {len(rows)} rows in {time.time() - t0:.1f}s")
    cur.close()

    result = defaultdict(dict)
    for codex, year, cnt in rows:
        result[codex][year] = cnt
    return dict(result)


def exp3_fetch_decisions_per_year(conn, year_from: int, year_to: int) -> dict:
    """Count total decisions per year from doc_metadata_lookup for normalization."""
    cur = conn.cursor()
    query = """
        SELECT adj_year, COUNT(*) AS cnt
        FROM doc_metadata_lookup
        WHERE adj_year BETWEEN %s AND %s
        GROUP BY adj_year
        ORDER BY adj_year
    """
    print("  Fetching decisions per year (from doc_metadata_lookup)...")
    t0 = time.time()
    cur.execute(query, (year_from, year_to))
    rows = cur.fetchall()
    print(f"  Got {len(rows)} rows in {time.time() - t0:.1f}s")
    cur.close()
    return {year: cnt for year, cnt in rows}


def exp3_detect_regime_transitions(codex_data: dict, decisions_per_year: dict) -> dict:
    """
    Compute YoY change rate for each codex (normalized by decisions).
    Flag years with >30% change as regime transitions.
    Returns: {codex: [(year, yoy_change, direction)]}
    """
    transitions = {}
    for codex, year_counts in codex_data.items():
        years_sorted = sorted(year_counts.keys())
        codex_transitions = []
        for i in range(1, len(years_sorted)):
            y_prev, y_curr = years_sorted[i - 1], years_sorted[i]
            # Normalize: citations per 1000 decisions
            dec_prev = decisions_per_year.get(y_prev, 1)
            dec_curr = decisions_per_year.get(y_curr, 1)
            rate_prev = year_counts[y_prev] / dec_prev
            rate_curr = year_counts[y_curr] / dec_curr
            if rate_prev > 0:
                yoy_change = (rate_curr - rate_prev) / rate_prev
            else:
                yoy_change = float("inf") if rate_curr > 0 else 0.0
            if abs(yoy_change) > REGIME_CHANGE_THRESHOLD:
                direction = "surge" if yoy_change > 0 else "decline"
                codex_transitions.append((y_curr, yoy_change, direction))
        transitions[codex] = codex_transitions
    return transitions


def exp3_plot_citation_trends(
    codex_data: dict,
    decisions_per_year: dict,
    transitions: dict,
    year_from: int,
    year_to: int,
):
    """Plot normalized citation trends per codex with regime transition markers."""
    fig, ax = plt.subplots(figsize=(14, 7))

    all_years = list(range(year_from, year_to + 1))
    colors = plt.cm.tab10(np.linspace(0, 1, len(CODEX_MAP)))

    for idx, (codex, color) in enumerate(zip(sorted(codex_data.keys()), colors)):
        year_counts = codex_data[codex]
        # Normalized: citations per 1000 decisions
        values = []
        for y in all_years:
            cnt = year_counts.get(y, 0)
            dec = decisions_per_year.get(y, 1)
            values.append(cnt / dec * 1000)
        ax.plot(all_years, values, marker="o", markersize=3, label=codex,
                color=color, linewidth=1.5)

    # Annotate known transitions
    for codex, events in KNOWN_TRANSITIONS.items():
        if codex in codex_data:
            for year, label in events:
                if year_from <= year <= year_to:
                    ax.axvline(x=year, color="gray", linestyle="--", alpha=0.4, linewidth=0.8)
                    ax.annotate(
                        label, xy=(year, ax.get_ylim()[1] * 0.95),
                        fontsize=6, rotation=90, ha="right", va="top",
                        color="gray", alpha=0.7,
                    )

    # Mark 2022 war
    if year_from <= 2022 <= year_to:
        ax.axvline(x=2022, color="red", linestyle="-.", alpha=0.5, linewidth=1.2)
        ax.annotate("2022 war", xy=(2022, ax.get_ylim()[1] * 0.85),
                     fontsize=8, color="red", alpha=0.7, ha="left")

    ax.set_xlabel("Year")
    ax.set_ylabel("Citations per 1,000 decisions")
    ax.set_title("Experiment 3: Codex Citation Density Over Time (Normalized)")
    ax.legend(loc="upper left", ncol=2)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(year_from - 0.5, year_to + 0.5)
    ax.xaxis.set_major_locator(mticker.MultipleLocator(1))
    plt.xticks(rotation=45, fontsize=8)
    plt.tight_layout()

    out_path = OUTPUT_DIR / "exp3_codex_citation_trends.png"
    fig.savefig(out_path)
    plt.close(fig)
    print(f"  Saved: {out_path}")


def exp3_plot_yoy_changes(codex_data: dict, decisions_per_year: dict, year_from: int, year_to: int):
    """Plot YoY change rates per codex as a heatmap-style chart."""
    codexes = sorted(codex_data.keys())
    all_years = list(range(year_from + 1, year_to + 1))

    matrix = np.zeros((len(codexes), len(all_years)))

    for i, codex in enumerate(codexes):
        year_counts = codex_data[codex]
        for j, y in enumerate(all_years):
            y_prev = y - 1
            dec_prev = decisions_per_year.get(y_prev, 1)
            dec_curr = decisions_per_year.get(y, 1)
            rate_prev = year_counts.get(y_prev, 0) / dec_prev
            rate_curr = year_counts.get(y, 0) / dec_curr
            if rate_prev > 0:
                matrix[i, j] = (rate_curr - rate_prev) / rate_prev
            else:
                matrix[i, j] = 0

    fig, ax = plt.subplots(figsize=(16, 5))
    # Clip for visual clarity
    matrix_clipped = np.clip(matrix, -1.0, 1.0)
    im = ax.imshow(matrix_clipped, aspect="auto", cmap="RdYlGn", vmin=-1, vmax=1)
    ax.set_xticks(range(len(all_years)))
    ax.set_xticklabels(all_years, rotation=45, fontsize=7)
    ax.set_yticks(range(len(codexes)))
    ax.set_yticklabels(codexes, fontsize=9)
    ax.set_title("Experiment 3: Year-over-Year Citation Rate Change by Codex")
    ax.set_xlabel("Year")

    # Mark cells exceeding threshold
    for i in range(len(codexes)):
        for j in range(len(all_years)):
            val = matrix[i, j]
            if abs(val) > REGIME_CHANGE_THRESHOLD:
                ax.text(j, i, f"{val:+.0%}", ha="center", va="center",
                        fontsize=5, fontweight="bold",
                        color="white" if abs(val) > 0.6 else "black")

    cbar = plt.colorbar(im, ax=ax, label="YoY change rate", shrink=0.8)
    cbar.ax.tick_params(labelsize=8)
    plt.tight_layout()

    out_path = OUTPUT_DIR / "exp3_yoy_change_heatmap.png"
    fig.savefig(out_path)
    plt.close(fig)
    print(f"  Saved: {out_path}")


def run_experiment_3(conn, year_from: int, year_to: int) -> dict:
    """Execute Experiment 3: Legislative regime change detection."""
    print("\n=== Experiment 3: Legislative Regime Change Detection ===\n")

    decisions_per_year = exp3_fetch_decisions_per_year(conn, year_from, year_to)
    codex_data = exp3_fetch_codex_citations_per_year(conn, year_from, year_to)

    if not codex_data:
        print("  No codex citation data found. Skipping plots.")
        return {"error": "no data"}

    transitions = exp3_detect_regime_transitions(codex_data, decisions_per_year)

    # Print detected transitions
    print("\n  Detected regime transitions (>30% YoY change):")
    for codex in sorted(transitions.keys()):
        events = transitions[codex]
        if events:
            print(f"    {codex}:")
            for year, change, direction in events:
                print(f"      {year}: {change:+.1%} ({direction})")

    # Generate plots
    exp3_plot_citation_trends(codex_data, decisions_per_year, transitions, year_from, year_to)
    exp3_plot_yoy_changes(codex_data, decisions_per_year, year_from, year_to)

    # Build stats
    stats = {
        "decisions_per_year": {str(k): v for k, v in sorted(decisions_per_year.items())},
        "codex_citations_per_year": {
            codex: {str(y): c for y, c in sorted(years.items())}
            for codex, years in sorted(codex_data.items())
        },
        "regime_transitions": {
            codex: [
                {"year": y, "yoy_change": round(ch, 4), "direction": d}
                for y, ch, d in events
            ]
            for codex, events in sorted(transitions.items())
            if events
        },
        "normalized_rates": {},
    }
    # Add normalized rates (per 1000 decisions)
    for codex, year_counts in sorted(codex_data.items()):
        stats["normalized_rates"][codex] = {
            str(y): round(year_counts.get(y, 0) / decisions_per_year.get(y, 1) * 1000, 4)
            for y in range(year_from, year_to + 1)
        }

    return stats


# ── Experiment 7: Impact of 2022 war ───────────────────────

def exp7_fetch_decisions_per_year(conn, year_from: int, year_to: int) -> dict:
    """Total decisions per year from doc_metadata_lookup."""
    cur = conn.cursor()
    query = """
        SELECT adj_year, COUNT(*) AS cnt
        FROM doc_metadata_lookup
        WHERE adj_year BETWEEN %s AND %s
        GROUP BY adj_year
        ORDER BY adj_year
    """
    print("  Fetching decisions per year (from doc_metadata_lookup)...")
    t0 = time.time()
    cur.execute(query, (year_from, year_to))
    rows = cur.fetchall()
    print(f"  Got {len(rows)} year buckets in {time.time() - t0:.1f}s")
    cur.close()
    return {year: cnt for year, cnt in rows}


def exp7_fetch_top_articles(conn, target_year: int, top_n: int = 20) -> list:
    """
    Top N cited articles in a given year.
    Uses pre-aggregated citation_year_stats table.
    Returns list of (law_number, law_article, count).
    """
    cur = conn.cursor()
    query = """
        SELECT law_number, law_article, SUM(citations) AS cnt
        FROM citation_year_stats
        WHERE year = %s
          AND citation_type IN ('codex_article', 'constitution', 'law_article')
          AND law_article IS NOT NULL
          AND law_article != ''
        GROUP BY law_number, law_article
        ORDER BY cnt DESC
        LIMIT %s
    """
    cur.execute(query, (target_year, top_n))
    rows = cur.fetchall()
    cur.close()
    return [(law, art, cnt) for law, art, cnt in rows]


def exp7_fetch_new_post_war_legislation(conn, min_citations: int = 50) -> list:
    """
    Articles with zero citations before 2022 but significant citations after.
    Uses pre-aggregated citation_year_stats table.
    Returns list of (law_number, law_article, post_count).
    """
    cur = conn.cursor()
    query = """
        WITH post AS (
            SELECT law_number, law_article, SUM(citations) AS post_cnt
            FROM citation_year_stats
            WHERE year >= 2022
              AND citation_type IN ('codex_article', 'constitution', 'law_article')
              AND law_article IS NOT NULL
              AND law_article != ''
            GROUP BY law_number, law_article
            HAVING SUM(citations) >= %s
        ),
        pre AS (
            SELECT law_number, law_article, SUM(citations) AS pre_cnt
            FROM citation_year_stats
            WHERE year < 2022
              AND citation_type IN ('codex_article', 'constitution', 'law_article')
              AND law_article IS NOT NULL
              AND law_article != ''
            GROUP BY law_number, law_article
        )
        SELECT post.law_number, post.law_article, post.post_cnt
        FROM post
        LEFT JOIN pre ON post.law_number = pre.law_number
                     AND post.law_article = pre.law_article
        WHERE pre.pre_cnt IS NULL
        ORDER BY post.post_cnt DESC
        LIMIT 30
    """
    print("  Fetching new post-war legislation (from citation_year_stats)...")
    t0 = time.time()
    cur.execute(query, (min_citations,))
    rows = cur.fetchall()
    print(f"  Found {len(rows)} new post-war articles in {time.time() - t0:.1f}s")
    cur.close()
    return [(law, art, cnt) for law, art, cnt in rows]


def exp7_fetch_citation_entropy_per_year(conn, year_from: int, year_to: int) -> dict:
    """
    Compute citation entropy per year.
    H = -sum(p_i * log(p_i)) where p_i = fraction of citations to article i.
    Uses pre-aggregated citation_year_stats table.
    Returns: {year: entropy}
    """
    cur = conn.cursor()
    # Get citation counts per article per year from pre-aggregated table
    query = """
        SELECT year, law_number, law_article, SUM(citations) AS cnt
        FROM citation_year_stats
        WHERE year BETWEEN %s AND %s
          AND citation_type IN ('codex_article', 'constitution', 'law_article')
          AND law_article IS NOT NULL
          AND law_article != ''
        GROUP BY year, law_number, law_article
        ORDER BY year
    """
    print("  Fetching citation distributions for entropy (from citation_year_stats)...")
    t0 = time.time()
    cur.execute(query, (year_from, year_to))
    rows = cur.fetchall()
    print(f"  Got {len(rows)} article-year buckets in {time.time() - t0:.1f}s")
    cur.close()

    # Group by year
    year_distributions = defaultdict(list)
    for year, law, art, cnt in rows:
        year_distributions[year].append(cnt)

    entropies = {}
    for year in sorted(year_distributions.keys()):
        counts = np.array(year_distributions[year], dtype=np.float64)
        total = counts.sum()
        if total == 0:
            entropies[year] = 0.0
            continue
        probs = counts / total
        # Filter out zeros to avoid log(0)
        probs = probs[probs > 0]
        entropy = -np.sum(probs * np.log2(probs))
        entropies[year] = float(entropy)

    return entropies


def exp7_plot_decisions_per_year(decisions_per_year: dict, year_from: int, year_to: int):
    """Bar chart of decisions per year, highlighting 2022 drop."""
    fig, ax = plt.subplots(figsize=(12, 5))

    years = sorted(decisions_per_year.keys())
    counts = [decisions_per_year[y] for y in years]
    colors = ["#d32f2f" if y == 2022 else "#1976d2" for y in years]

    ax.bar(years, counts, color=colors, edgecolor="white", linewidth=0.5)

    # Annotate 2022
    if 2022 in decisions_per_year:
        idx_2022 = years.index(2022)
        ax.annotate(
            f"2022: {decisions_per_year[2022]:,}\n(war)",
            xy=(2022, decisions_per_year[2022]),
            xytext=(2022 + 1.5, decisions_per_year[2022] * 1.15),
            arrowprops=dict(arrowstyle="->", color="red"),
            fontsize=9, color="red", fontweight="bold",
        )
        # Show percentage drop from 2021
        if 2021 in decisions_per_year and decisions_per_year[2021] > 0:
            drop = (decisions_per_year[2021] - decisions_per_year[2022]) / decisions_per_year[2021]
            ax.annotate(
                f"{drop:.0%} drop",
                xy=(2022, decisions_per_year[2022] * 0.5),
                fontsize=10, color="red", ha="center", fontweight="bold",
            )

    ax.set_xlabel("Year")
    ax.set_ylabel("Number of decisions")
    ax.set_title("Experiment 7a: Court Decisions Per Year")
    ax.grid(True, axis="y", alpha=0.3)
    ax.xaxis.set_major_locator(mticker.MultipleLocator(1))
    plt.xticks(rotation=45, fontsize=8)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()

    out_path = OUTPUT_DIR / "exp7a_decisions_per_year.png"
    fig.savefig(out_path)
    plt.close(fig)
    print(f"  Saved: {out_path}")


def exp7_plot_citation_entropy(entropies: dict, year_from: int, year_to: int):
    """Plot citation entropy over time."""
    fig, ax = plt.subplots(figsize=(12, 5))

    years = sorted(entropies.keys())
    values = [entropies[y] for y in years]

    ax.plot(years, values, marker="o", markersize=5, color="#1976d2", linewidth=2)
    ax.fill_between(years, values, alpha=0.1, color="#1976d2")

    # Highlight 2022
    if 2022 in entropies:
        ax.plot(2022, entropies[2022], "ro", markersize=10, zorder=5)
        ax.annotate(
            f"2022: H={entropies[2022]:.2f}",
            xy=(2022, entropies[2022]),
            xytext=(2022 + 1, entropies[2022] - 0.3),
            arrowprops=dict(arrowstyle="->", color="red"),
            fontsize=9, color="red", fontweight="bold",
        )

    ax.set_xlabel("Year")
    ax.set_ylabel("Shannon Entropy (bits)")
    ax.set_title("Experiment 7b: Citation Entropy Over Time")
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_locator(mticker.MultipleLocator(1))
    plt.xticks(rotation=45, fontsize=8)
    plt.tight_layout()

    out_path = OUTPUT_DIR / "exp7b_citation_entropy.png"
    fig.savefig(out_path)
    plt.close(fig)
    print(f"  Saved: {out_path}")


def exp7_plot_top_articles_shift(top_2021: list, top_2023: list):
    """
    Heatmap showing top-20 cited articles in 2021 vs 2023.
    Rows = union of top articles, columns = [2021, 2023].
    """
    # Build article labels and counts
    label_fn = lambda law, art: f"{_abbreviate_law(law)} ст.{art}"
    articles_2021 = {(law, art): cnt for law, art, cnt in top_2021}
    articles_2023 = {(law, art): cnt for law, art, cnt in top_2023}

    # Union of all articles, ordered by combined rank
    all_articles = []
    seen = set()
    for law, art, _ in top_2021:
        key = (law, art)
        if key not in seen:
            all_articles.append(key)
            seen.add(key)
    for law, art, _ in top_2023:
        key = (law, art)
        if key not in seen:
            all_articles.append(key)
            seen.add(key)

    # Limit to top 30 for readability
    all_articles = all_articles[:30]

    labels = [label_fn(law, art) for law, art in all_articles]
    counts_2021 = [articles_2021.get(key, 0) for key in all_articles]
    counts_2023 = [articles_2023.get(key, 0) for key in all_articles]

    fig, ax = plt.subplots(figsize=(10, 10))

    x = np.arange(len(labels))
    width = 0.35

    bars_2021 = ax.barh(x + width / 2, counts_2021, width, label="2021", color="#1976d2", alpha=0.8)
    bars_2023 = ax.barh(x - width / 2, counts_2023, width, label="2023", color="#d32f2f", alpha=0.8)

    ax.set_yticks(x)
    ax.set_yticklabels(labels, fontsize=7)
    ax.invert_yaxis()
    ax.set_xlabel("Citation count")
    ax.set_title("Experiment 7c: Top Cited Articles — 2021 vs 2023")
    ax.legend()
    ax.grid(True, axis="x", alpha=0.3)
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    plt.tight_layout()

    out_path = OUTPUT_DIR / "exp7c_top_articles_shift.png"
    fig.savefig(out_path)
    plt.close(fig)
    print(f"  Saved: {out_path}")


def _abbreviate_law(law_name: str) -> str:
    """Abbreviate long law names for plot labels."""
    abbrevs = {
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
        "Кодекс України про адміністративні правопорушення": "КУпАП",
        "Конституція України": "КУ",
    }
    for full, short in abbrevs.items():
        if law_name == full:
            return short
    # Truncate if still long
    if len(law_name) > 30:
        return law_name[:27] + "..."
    return law_name


def run_experiment_7(conn, year_from: int, year_to: int) -> dict:
    """Execute Experiment 7: Impact of 2022 war."""
    print("\n=== Experiment 7: Impact of 2022 War ===\n")

    # 7a: Decisions per year
    decisions_per_year = exp7_fetch_decisions_per_year(conn, year_from, year_to)
    exp7_plot_decisions_per_year(decisions_per_year, year_from, year_to)

    # Print the drop
    if 2021 in decisions_per_year and 2022 in decisions_per_year:
        drop = (decisions_per_year[2021] - decisions_per_year[2022]) / decisions_per_year[2021]
        print(f"\n  2021: {decisions_per_year[2021]:,} decisions")
        print(f"  2022: {decisions_per_year[2022]:,} decisions")
        print(f"  Drop: {drop:.1%}")
        if 2023 in decisions_per_year:
            recovery = (decisions_per_year[2023] - decisions_per_year[2022]) / decisions_per_year[2022]
            print(f"  2023: {decisions_per_year[2023]:,} decisions (recovery: {recovery:+.1%})")

    # 7b: Citation entropy
    print()
    entropies = exp7_fetch_citation_entropy_per_year(conn, year_from, year_to)
    exp7_plot_citation_entropy(entropies, year_from, year_to)

    if entropies:
        print("\n  Citation entropy by year:")
        for y in sorted(entropies.keys()):
            marker = " <-- war" if y == 2022 else ""
            print(f"    {y}: H = {entropies[y]:.4f}{marker}")

    # 7c: Top articles shift (2021 vs 2023)
    print("\n  Fetching top-20 articles for 2021...")
    top_2021 = exp7_fetch_top_articles(conn, 2021, top_n=20)
    print(f"  Got {len(top_2021)} articles for 2021")

    print("  Fetching top-20 articles for 2023...")
    top_2023 = exp7_fetch_top_articles(conn, 2023, top_n=20)
    print(f"  Got {len(top_2023)} articles for 2023")

    if top_2021 and top_2023:
        exp7_plot_top_articles_shift(top_2021, top_2023)

    # Print comparison
    if top_2021:
        print("\n  Top-10 cited articles in 2021:")
        for law, art, cnt in top_2021[:10]:
            print(f"    {_abbreviate_law(law)} ст.{art}: {cnt:,}")
    if top_2023:
        print("\n  Top-10 cited articles in 2023:")
        for law, art, cnt in top_2023[:10]:
            print(f"    {_abbreviate_law(law)} ст.{art}: {cnt:,}")

    # 7d: New post-war legislation
    new_legislation = exp7_fetch_new_post_war_legislation(conn, min_citations=50)
    if new_legislation:
        print(f"\n  New legislation appearing after 2022 (0 pre-war citations, >=50 post-war):")
        for law, art, cnt in new_legislation[:15]:
            print(f"    {_abbreviate_law(law)} ст.{art}: {cnt:,} citations")

    # Build stats
    stats = {
        "decisions_per_year": {str(k): v for k, v in sorted(decisions_per_year.items())},
        "drop_2022": None,
        "citation_entropy": {str(k): round(v, 6) for k, v in sorted(entropies.items())},
        "top_articles_2021": [
            {"law": law, "article": art, "count": cnt}
            for law, art, cnt in top_2021
        ],
        "top_articles_2023": [
            {"law": law, "article": art, "count": cnt}
            for law, art, cnt in top_2023
        ],
        "new_post_war_legislation": [
            {"law": law, "article": art, "post_war_count": cnt}
            for law, art, cnt in new_legislation
        ],
    }

    if 2021 in decisions_per_year and 2022 in decisions_per_year:
        stats["drop_2022"] = {
            "decisions_2021": decisions_per_year[2021],
            "decisions_2022": decisions_per_year[2022],
            "drop_pct": round(
                (decisions_per_year[2021] - decisions_per_year[2022])
                / decisions_per_year[2021],
                4,
            ),
        }
        if 2023 in decisions_per_year:
            stats["drop_2022"]["decisions_2023"] = decisions_per_year[2023]
            stats["drop_2022"]["recovery_pct"] = round(
                (decisions_per_year[2023] - decisions_per_year[2022])
                / decisions_per_year[2022],
                4,
            )

    return stats


# ── Main ────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Temporal dynamics analysis of Ukrainian court citation data"
    )
    parser.add_argument(
        "--year-from", type=int, default=2007,
        help="Start year (default: 2007)",
    )
    parser.add_argument(
        "--year-to", type=int, default=2026,
        help="End year (default: 2026)",
    )
    parser.add_argument(
        "--experiment", type=int, choices=[3, 7],
        help="Run only this experiment (default: run both)",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"=== Temporal Dynamics Analysis ===")
    print(f"Years: {args.year_from}--{args.year_to}")
    print(f"DB: {DB_DSN.split('@')[1] if '@' in DB_DSN else DB_DSN}")
    print(f"Output: {OUTPUT_DIR}")

    t_total = time.time()
    conn = get_conn()

    all_stats = {}

    try:
        if args.experiment is None or args.experiment == 3:
            all_stats["experiment_3"] = run_experiment_3(conn, args.year_from, args.year_to)

        if args.experiment is None or args.experiment == 7:
            all_stats["experiment_7"] = run_experiment_7(conn, args.year_from, args.year_to)
    finally:
        conn.close()

    elapsed = time.time() - t_total

    # Save stats to JSON
    all_stats["meta"] = {
        "year_from": args.year_from,
        "year_to": args.year_to,
        "elapsed_sec": round(elapsed, 2),
        "experiments_run": [3, 7] if args.experiment is None else [args.experiment],
    }

    stats_path = OUTPUT_DIR / "temporal-dynamics-stats.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(all_stats, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nStats saved to {stats_path}")

    print(f"\n=== Done in {elapsed:.1f}s ===")


if __name__ == "__main__":
    main()
