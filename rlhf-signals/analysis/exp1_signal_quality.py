"""
Experiment 1 Phase A: Signal Quality Analysis
Founder-side distribution analysis + skeleton for crowd comparison

Usage:
  cd rlhf-signals
  pip install -r analysis/requirements.txt
  python analysis/exp1_signal_quality.py

Output figures saved to: output/experiment1/figures/
"""

import os
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import psycopg2
import seaborn as sns
from dotenv import load_dotenv
from scipy import stats

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://secondlayer@localhost:5432/lex_rlhf_signals")
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output" / "experiment1" / "figures"

plt.style.use("seaborn-v0_8-paper")
plt.rcParams.update({
    "figure.dpi": 300,
    "savefig.dpi": 300,
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.labelsize": 11,
    "figure.figsize": (8, 5),
    "savefig.bbox": "tight",
})

CLASS_ORDER = [
    "substantive_rewrite",
    "reorganization",
    "cosmetic",
    "rejection",
    "factual_correction",
    "tone_adjustment",
]

CLASS_COLORS = {
    "substantive_rewrite": "#d62728",
    "reorganization": "#ff7f0e",
    "cosmetic": "#2ca02c",
    "rejection": "#1f77b4",
    "factual_correction": "#9467bd",
    "tone_adjustment": "#8c564b",
}


def load_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    conn = psycopg2.connect(DATABASE_URL)
    df_edits = pd.read_sql("""
        SELECT we.edit_id, we.session_id, we.edit_distance_norm,
               we.semantic_change_class, we.edit_distance
        FROM workflow_edits we
        WHERE we.semantic_change_class IS NOT NULL
          AND we.edit_distance_norm IS NOT NULL
    """, conn)

    df_sessions = pd.read_sql("""
        SELECT session_id, source, created_at, terminal_at
        FROM workflow_sessions
    """, conn)

    df_outcomes = pd.read_sql("""
        SELECT session_id, outcome_type, attribution_confidence
        FROM workflow_outcomes
    """, conn)

    conn.close()
    return df_edits, df_sessions, df_outcomes


def fig1_edit_distance_distribution(df: pd.DataFrame):
    fig, ax1 = plt.subplots()
    dist = df["edit_distance_norm"].dropna()

    ax1.hist(dist, bins=50, color="#1f77b4", alpha=0.7, edgecolor="white", label="Count")
    ax1.set_xlabel("Normalized Edit Distance")
    ax1.set_ylabel("Count", color="#1f77b4")
    ax1.tick_params(axis="y", labelcolor="#1f77b4")

    ax2 = ax1.twinx()
    sorted_vals = np.sort(dist.values)
    cdf = np.arange(1, len(sorted_vals) + 1) / len(sorted_vals)
    ax2.plot(sorted_vals, cdf, color="#d62728", linewidth=2, label="CDF")
    ax2.set_ylabel("Cumulative Probability", color="#d62728")
    ax2.tick_params(axis="y", labelcolor="#d62728")

    mean_val = dist.mean()
    median_val = dist.median()
    ax1.axvline(mean_val, color="green", linestyle="--", alpha=0.8, label=f"Mean={mean_val:.3f}")
    ax1.axvline(median_val, color="orange", linestyle="-.", alpha=0.8, label=f"Median={median_val:.3f}")

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper left", fontsize=8)

    ax1.set_title("Founder Edit Distance Distribution (N={:,})".format(len(dist)))
    fig.savefig(OUTPUT_DIR / "fig1_edit_distance_distribution.png")
    plt.close(fig)
    print(f"  Fig 1: edit distance distribution (N={len(dist):,})")


def fig2_semantic_class_breakdown(df: pd.DataFrame):
    counts = df["semantic_change_class"].value_counts()
    counts = counts.reindex(CLASS_ORDER).dropna().astype(int)
    total = counts.sum()

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.barh(
        counts.index,
        counts.values,
        color=[CLASS_COLORS.get(c, "#999") for c in counts.index],
    )
    for bar, count in zip(bars, counts.values):
        pct = count / total * 100
        ax.text(bar.get_width() + total * 0.005, bar.get_y() + bar.get_height() / 2,
                f"{count:,} ({pct:.1f}%)", va="center", fontsize=9)

    ax.set_xlabel("Count")
    ax.set_title("Semantic Change Class Distribution")
    ax.invert_yaxis()
    ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))
    fig.savefig(OUTPUT_DIR / "fig2_semantic_class_breakdown.png")
    plt.close(fig)
    print(f"  Fig 2: semantic class breakdown ({len(counts)} classes)")


def fig3_edit_distance_per_class(df: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(10, 5))
    order = (
        df.groupby("semantic_change_class")["edit_distance_norm"]
        .median()
        .sort_values(ascending=False)
        .index.tolist()
    )
    sns.boxplot(
        data=df, y="semantic_change_class", x="edit_distance_norm",
        order=order, palette=CLASS_COLORS, ax=ax, width=0.6,
    )
    ax.set_xlabel("Normalized Edit Distance")
    ax.set_ylabel("")
    ax.set_title("Edit Distance by Semantic Class")
    fig.savefig(OUTPUT_DIR / "fig3_edit_distance_per_class.png")
    plt.close(fig)
    print(f"  Fig 3: edit distance per class (box plots)")


def fig4_source_vs_class(df_edits: pd.DataFrame, df_sessions: pd.DataFrame):
    merged = df_edits.merge(df_sessions[["session_id", "source"]], on="session_id", how="left")
    ct = pd.crosstab(merged["source"], merged["semantic_change_class"])
    ct = ct.reindex(columns=CLASS_ORDER, fill_value=0)

    fig, ax = plt.subplots(figsize=(10, 5))
    ct.plot(kind="bar", stacked=True, ax=ax,
            color=[CLASS_COLORS.get(c, "#999") for c in ct.columns])
    ax.set_xlabel("Session Source")
    ax.set_ylabel("Edit Count")
    ax.set_title("Session Source vs Semantic Change Class")
    ax.legend(title="Edit Class", bbox_to_anchor=(1.02, 1), loc="upper left", fontsize=8)
    plt.xticks(rotation=30, ha="right")
    fig.savefig(OUTPUT_DIR / "fig4_source_vs_class.png")
    plt.close(fig)
    print(f"  Fig 4: source vs class (stacked bar)")


def fig5_summary_table(df: pd.DataFrame):
    stats_rows = []
    for cls in CLASS_ORDER:
        subset = df[df["semantic_change_class"] == cls]["edit_distance_norm"]
        if len(subset) == 0:
            continue
        stats_rows.append({
            "Class": cls,
            "Count": f"{len(subset):,}",
            "%": f"{len(subset) / len(df) * 100:.1f}%",
            "Mean": f"{subset.mean():.4f}",
            "Median": f"{subset.median():.4f}",
            "Std": f"{subset.std():.4f}",
            "P25": f"{subset.quantile(0.25):.4f}",
            "P75": f"{subset.quantile(0.75):.4f}",
        })

    tbl = pd.DataFrame(stats_rows)
    fig, ax = plt.subplots(figsize=(10, 3))
    ax.axis("off")
    table = ax.table(
        cellText=tbl.values, colLabels=tbl.columns,
        cellLoc="center", loc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.auto_set_column_width(list(range(len(tbl.columns))))
    for (row, col), cell in table.get_celld().items():
        if row == 0:
            cell.set_facecolor("#4472C4")
            cell.set_text_props(color="white", fontweight="bold")

    ax.set_title("Summary Statistics by Semantic Change Class", pad=20)
    fig.savefig(OUTPUT_DIR / "fig5_summary_table.png")
    plt.close(fig)
    print(f"  Fig 5: summary statistics table")


def fig6_monthly_heatmap(df_edits: pd.DataFrame, df_sessions: pd.DataFrame):
    merged = df_edits.merge(df_sessions[["session_id", "created_at"]], on="session_id", how="left")
    merged["month"] = pd.to_datetime(merged["created_at"]).dt.to_period("M").astype(str)
    pivot = merged.pivot_table(
        index="semantic_change_class", columns="month", values="edit_id",
        aggfunc="count", fill_value=0,
    )
    pivot = pivot.reindex(CLASS_ORDER).dropna(how="all")

    fig, ax = plt.subplots(figsize=(10, 4))
    sns.heatmap(pivot, annot=True, fmt=",", cmap="YlOrRd", ax=ax, linewidths=0.5)
    ax.set_title("Edit Volume: Semantic Class x Month")
    ax.set_ylabel("")
    ax.set_xlabel("")
    fig.savefig(OUTPUT_DIR / "fig6_monthly_heatmap.png")
    plt.close(fig)
    print(f"  Fig 6: monthly volume heatmap")


# --- Crowd comparison skeleton (to be filled when crowd data arrives) ---

def ks_test_founder_vs_crowd(founder_dist: np.ndarray, crowd_dist: np.ndarray) -> dict:
    """Two-sample Kolmogorov-Smirnov test."""
    statistic, pvalue = stats.ks_2samp(founder_dist, crowd_dist)
    return {"ks_statistic": statistic, "p_value": pvalue}


def bootstrap_ci(
    data: np.ndarray,
    statistic_fn=np.mean,
    n_bootstrap: int = 10_000,
    ci: float = 0.95,
    seed: int = 42,
) -> tuple[float, float, float]:
    """Bootstrap confidence interval for a statistic."""
    rng = np.random.default_rng(seed)
    boot_stats = np.array([
        statistic_fn(rng.choice(data, size=len(data), replace=True))
        for _ in range(n_bootstrap)
    ])
    alpha = (1 - ci) / 2
    lo, hi = np.quantile(boot_stats, [alpha, 1 - alpha])
    return float(statistic_fn(data)), float(lo), float(hi)


def plot_founder_vs_crowd_distributions(
    founder_df: pd.DataFrame, crowd_df: pd.DataFrame, output_path: Path
):
    """Side-by-side histogram/CDF comparison. Fill when crowd data arrives."""
    pass


def krippendorff_alpha(annotations: np.ndarray) -> float:
    """Krippendorff's alpha for inter-annotator agreement. Fill when crowd data arrives."""
    pass


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print("Loading data from DB...")

    df_edits, df_sessions, df_outcomes = load_data()
    print(f"Loaded: {len(df_edits):,} edits, {len(df_sessions):,} sessions, {len(df_outcomes):,} outcomes")

    print("\nGenerating paper figures...")
    fig1_edit_distance_distribution(df_edits)
    fig2_semantic_class_breakdown(df_edits)
    fig3_edit_distance_per_class(df_edits)
    fig4_source_vs_class(df_edits, df_sessions)
    fig5_summary_table(df_edits)
    fig6_monthly_heatmap(df_edits, df_sessions)

    print(f"\nAll figures saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
