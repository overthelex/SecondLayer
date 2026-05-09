"""
Experiment 3: Outcome-Preference Correlation Analysis (RQ3)
Do high-engagement edits correlate with positive outcomes more strongly?

Usage:
  cd rlhf-signals
  python3 analysis/exp3_outcome_correlation.py
"""

import os
import warnings
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import psycopg2
import seaborn as sns
from dotenv import load_dotenv
from scipy import stats

warnings.filterwarnings("ignore", category=FutureWarning)

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://secondlayer@localhost:5432/lex_rlhf_signals")
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output" / "experiment3" / "figures"

plt.style.use("seaborn-v0_8-paper")
plt.rcParams.update({
    "figure.dpi": 300, "savefig.dpi": 300, "font.size": 10,
    "axes.titlesize": 12, "axes.labelsize": 11,
    "figure.figsize": (8, 5), "savefig.bbox": "tight",
})

POSITIVE_OUTCOMES = {"merged_clean", "issue_resolved"}
NEGATIVE_OUTCOMES = {"closed_unmerged", "closed_obsolete"}


def load_full_dataset() -> tuple[pd.DataFrame, pd.DataFrame]:
    conn = psycopg2.connect(DATABASE_URL)

    df_edits = pd.read_sql("""
        SELECT we.edit_id, we.session_id, we.edit_distance_norm,
               we.semantic_change_class, we.edit_seconds,
               fa.token_count AS token_count_from,
               ta.token_count AS token_count_to,
               ws.source AS session_source,
               ws.created_at AS session_created
        FROM workflow_edits we
        JOIN workflow_artifacts fa ON we.from_artifact_id = fa.artifact_id
        JOIN workflow_artifacts ta ON we.to_artifact_id = ta.artifact_id
        JOIN workflow_sessions ws ON ws.session_id = we.session_id
        WHERE we.semantic_change_class IS NOT NULL
    """, conn)

    df_outcomes = pd.read_sql("""
        SELECT wo.session_id, wo.outcome_type, wo.attribution_confidence,
               wo.attribution_window_days
        FROM workflow_outcomes wo
    """, conn)

    conn.close()
    return df_edits, df_outcomes


def load_overlap_dataset() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL)
    df = pd.read_sql("""
        SELECT we.edit_id, we.session_id, we.edit_distance_norm,
               we.semantic_change_class,
               ee.active_seconds, ee.passive_seconds, ee.idle_seconds,
               ee.total_key_presses, ee.idle_gap_count,
               ee.apps_touched, ee.research_switches,
               ee.voice_context, ee.window_dwell_entropy,
               ee.process_data_available,
               wo.outcome_type, wo.attribution_confidence,
               ws.source AS session_source,
               ws.created_at AS session_created
        FROM workflow_edits we
        JOIN workflow_edit_engagement ee ON we.edit_id = ee.edit_id
        JOIN workflow_sessions ws ON ws.session_id = we.session_id
        LEFT JOIN workflow_outcomes wo ON wo.session_id = we.session_id
        WHERE ee.process_data_available = true
    """, conn)
    conn.close()
    df["voice_context_int"] = df["voice_context"].astype(int) if "voice_context" in df.columns else 0
    return df


def compute_engagement_score(df: pd.DataFrame) -> pd.Series:
    features = []
    for col in ["active_seconds", "total_key_presses", "idle_gap_count",
                 "apps_touched", "research_switches"]:
        if col in df.columns:
            vals = df[col].fillna(0)
            normed = (vals - vals.min()) / (vals.max() - vals.min() + 1e-9)
            features.append(normed)
    if not features:
        return pd.Series(0, index=df.index)
    return pd.concat(features, axis=1).mean(axis=1)


def classify_outcome(outcome_type):
    if pd.isna(outcome_type):
        return "no_outcome"
    if outcome_type in POSITIVE_OUTCOMES:
        return "positive"
    if outcome_type in NEGATIVE_OUTCOMES:
        return "negative"
    return "mixed"


# --- LEVEL 1: Full dataset (artifact-only) ---

def fig15_edit_class_vs_outcome(df_edits: pd.DataFrame, df_outcomes: pd.DataFrame):
    merged = df_edits.merge(df_outcomes, on="session_id", how="left")
    merged["outcome_label"] = merged["outcome_type"].apply(classify_outcome)
    merged = merged[merged["outcome_label"] != "no_outcome"]

    ct = pd.crosstab(merged["semantic_change_class"], merged["outcome_label"], normalize="index")
    order = ["substantive_rewrite", "reorganization", "cosmetic", "rejection",
             "factual_correction", "tone_adjustment"]
    ct = ct.reindex([c for c in order if c in ct.index])

    fig, ax = plt.subplots(figsize=(10, 5))
    ct.plot(kind="barh", stacked=True, ax=ax,
            color={"positive": "#2ca02c", "negative": "#d62728", "mixed": "#ff7f0e"})
    ax.set_xlabel("Proportion")
    ax.set_title("Outcome Distribution by Semantic Change Class (N={:,} edits with outcomes)".format(len(merged)))
    ax.legend(title="Outcome", loc="lower right")
    fig.savefig(OUTPUT_DIR / "fig15_edit_class_vs_outcome.png")
    plt.close(fig)
    print(f"  Fig 15: edit class vs outcome (N={len(merged):,})")


def fig16_edit_distance_by_outcome(df_edits: pd.DataFrame, df_outcomes: pd.DataFrame):
    merged = df_edits.merge(df_outcomes, on="session_id", how="left")
    merged["outcome_label"] = merged["outcome_type"].apply(classify_outcome)
    merged = merged[merged["outcome_label"].isin(["positive", "negative"])]

    fig, ax = plt.subplots(figsize=(8, 5))
    for label, color in [("positive", "#2ca02c"), ("negative", "#d62728")]:
        subset = merged[merged["outcome_label"] == label]["edit_distance_norm"]
        ax.hist(subset, bins=40, alpha=0.6, color=color, label=f"{label} (N={len(subset):,})", density=True)

    ax.set_xlabel("Normalized Edit Distance")
    ax.set_ylabel("Density")
    ax.set_title("Edit Distance Distribution: Positive vs Negative Outcomes")
    ax.legend()

    pos = merged[merged["outcome_label"] == "positive"]["edit_distance_norm"]
    neg = merged[merged["outcome_label"] == "negative"]["edit_distance_norm"]
    ks_stat, ks_p = stats.ks_2samp(pos, neg)
    ax.annotate(f"KS={ks_stat:.3f}, p={ks_p:.4f}", xy=(0.02, 0.95), xycoords="axes fraction", fontsize=9)

    fig.savefig(OUTPUT_DIR / "fig16_edit_distance_by_outcome.png")
    plt.close(fig)
    print(f"  Fig 16: edit distance by outcome (KS={ks_stat:.3f}, p={ks_p:.4f})")


def fig17_confidence_breakdown(df_outcomes: pd.DataFrame):
    conf = df_outcomes["attribution_confidence"].value_counts()
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(conf.index, conf.values, color=["#2ca02c", "#ff7f0e", "#d62728"])
    for bar, v in zip(bars, conf.values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 10,
                f"{v:,}\n({v/conf.sum()*100:.1f}%)", ha="center", fontsize=9)
    ax.set_ylabel("Count")
    ax.set_title(f"Attribution Confidence Distribution (N={conf.sum():,})")
    fig.savefig(OUTPUT_DIR / "fig17_confidence_breakdown.png")
    plt.close(fig)
    print(f"  Fig 17: confidence breakdown")


def fig18_outcome_by_source(df_edits: pd.DataFrame, df_outcomes: pd.DataFrame):
    session_source = df_edits.groupby("session_id")["session_source"].first()
    merged = df_outcomes.merge(session_source, on="session_id", how="left")
    merged["outcome_label"] = merged["outcome_type"].apply(classify_outcome)

    ct = pd.crosstab(merged["session_source"], merged["outcome_label"], normalize="index")
    fig, ax = plt.subplots(figsize=(8, 4))
    ct.plot(kind="bar", stacked=True, ax=ax,
            color={"positive": "#2ca02c", "negative": "#d62728", "mixed": "#ff7f0e", "no_outcome": "#ccc"})
    ax.set_xlabel("Session Source")
    ax.set_ylabel("Proportion")
    ax.set_title("Outcome Distribution by Session Source")
    ax.legend(title="Outcome", bbox_to_anchor=(1.02, 1), loc="upper left", fontsize=8)
    plt.xticks(rotation=20, ha="right")
    fig.savefig(OUTPUT_DIR / "fig18_outcome_by_source.png")
    plt.close(fig)
    print(f"  Fig 18: outcome by source")


# --- LEVEL 2: Overlap subset (artifact + process) ---

def fig19_engagement_vs_outcome(df_overlap: pd.DataFrame):
    df = df_overlap.copy()
    df["engagement_score"] = compute_engagement_score(df)
    df["outcome_label"] = df["outcome_type"].apply(classify_outcome)
    df = df[df["outcome_label"].isin(["positive", "negative"])]

    if len(df) < 10:
        print(f"  Fig 19: SKIPPED (only {len(df)} edits with outcomes in overlap)")
        return

    fig, ax = plt.subplots(figsize=(8, 5))
    for label, color in [("positive", "#2ca02c"), ("negative", "#d62728")]:
        subset = df[df["outcome_label"] == label]["engagement_score"]
        ax.hist(subset, bins=30, alpha=0.6, color=color, label=f"{label} (N={len(subset):,})", density=True)

    ax.set_xlabel("Composite Engagement Score")
    ax.set_ylabel("Density")
    ax.set_title("Engagement Score: Positive vs Negative Outcomes (Overlap Subset)")
    ax.legend()

    pos = df[df["outcome_label"] == "positive"]["engagement_score"]
    neg = df[df["outcome_label"] == "negative"]["engagement_score"]
    if len(pos) > 2 and len(neg) > 2:
        ks_stat, ks_p = stats.ks_2samp(pos, neg)
        mw_stat, mw_p = stats.mannwhitneyu(pos, neg, alternative="two-sided")
        ax.annotate(f"KS={ks_stat:.3f} (p={ks_p:.3f})\nMW U={mw_stat:.0f} (p={mw_p:.3f})",
                    xy=(0.02, 0.88), xycoords="axes fraction", fontsize=9)

    fig.savefig(OUTPUT_DIR / "fig19_engagement_vs_outcome.png")
    plt.close(fig)
    print(f"  Fig 19: engagement vs outcome (N={len(df)})")


def fig20_engagement_quartiles(df_overlap: pd.DataFrame):
    df = df_overlap.copy()
    df["engagement_score"] = compute_engagement_score(df)
    df["outcome_label"] = df["outcome_type"].apply(classify_outcome)
    df = df[df["outcome_label"] != "no_outcome"]

    if len(df) < 20:
        print(f"  Fig 20: SKIPPED (only {len(df)} edits with outcomes)")
        return

    df["engagement_quartile"] = pd.qcut(df["engagement_score"], q=4, labels=["Q1 (low)", "Q2", "Q3", "Q4 (high)"])

    ct = pd.crosstab(df["engagement_quartile"], df["outcome_label"], normalize="index")
    fig, ax = plt.subplots(figsize=(8, 5))
    ct.plot(kind="bar", stacked=True, ax=ax,
            color={"positive": "#2ca02c", "negative": "#d62728", "mixed": "#ff7f0e"})
    ax.set_xlabel("Engagement Quartile")
    ax.set_ylabel("Proportion")
    ax.set_title("Outcome Distribution by Engagement Quartile")
    ax.legend(title="Outcome")
    plt.xticks(rotation=0)
    fig.savefig(OUTPUT_DIR / "fig20_engagement_quartiles.png")
    plt.close(fig)
    print(f"  Fig 20: engagement quartiles vs outcome (N={len(df)})")


def fig21_confound_control(df_edits: pd.DataFrame, df_outcomes: pd.DataFrame):
    merged = df_edits.merge(df_outcomes, on="session_id", how="inner")
    merged["outcome_label"] = merged["outcome_type"].apply(classify_outcome)
    merged = merged[merged["outcome_label"].isin(["positive", "negative"])]
    merged["outcome_binary"] = (merged["outcome_label"] == "positive").astype(int)
    merged["hour_utc"] = pd.to_datetime(merged["session_created"]).dt.hour
    merged["day_of_week"] = pd.to_datetime(merged["session_created"]).dt.dayofweek

    fig, axes = plt.subplots(1, 3, figsize=(15, 4))

    hourly = merged.groupby("hour_utc")["outcome_binary"].agg(["mean", "count"])
    hourly = hourly[hourly["count"] >= 5]
    axes[0].bar(hourly.index, hourly["mean"], color="#1f77b4", alpha=0.7)
    axes[0].set_xlabel("Hour (UTC)")
    axes[0].set_ylabel("Positive Outcome Rate")
    axes[0].set_title("Outcome Rate by Hour of Day")
    axes[0].set_ylim(0, 1)

    daily = merged.groupby("day_of_week")["outcome_binary"].agg(["mean", "count"])
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    axes[1].bar(range(len(daily)), daily["mean"], color="#ff7f0e", alpha=0.7)
    axes[1].set_xticks(range(len(daily)))
    axes[1].set_xticklabels([day_labels[i] for i in daily.index])
    axes[1].set_ylabel("Positive Outcome Rate")
    axes[1].set_title("Outcome Rate by Day of Week")
    axes[1].set_ylim(0, 1)

    by_source = merged.groupby("session_source")["outcome_binary"].agg(["mean", "count"])
    by_source = by_source.sort_values("mean", ascending=True)
    axes[2].barh(by_source.index, by_source["mean"], color="#2ca02c", alpha=0.7)
    for i, (idx, row) in enumerate(by_source.iterrows()):
        axes[2].text(row["mean"] + 0.01, i, f'N={int(row["count"]):,}', va="center", fontsize=8)
    axes[2].set_xlabel("Positive Outcome Rate")
    axes[2].set_title("Outcome Rate by Source")
    axes[2].set_xlim(0, 1)

    plt.suptitle("Confound Analysis: Temporal and Source Effects on Outcomes", y=1.02)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "fig21_confound_control.png")
    plt.close(fig)
    print(f"  Fig 21: confound controls (hour, day, source)")


def fig22_summary_table(df_edits, df_outcomes, df_overlap):
    merged_full = df_edits.merge(df_outcomes, on="session_id", how="inner")
    merged_full["outcome_label"] = merged_full["outcome_type"].apply(classify_outcome)

    rows = []
    for cls in ["substantive_rewrite", "reorganization", "cosmetic", "rejection",
                "factual_correction", "tone_adjustment"]:
        subset = merged_full[merged_full["semantic_change_class"] == cls]
        total = len(subset)
        if total == 0:
            continue
        pos = (subset["outcome_label"] == "positive").sum()
        neg = (subset["outcome_label"] == "negative").sum()
        rows.append({
            "Class": cls,
            "Edits w/ Outcome": f"{total:,}",
            "Positive": f"{pos:,} ({pos/total*100:.1f}%)",
            "Negative": f"{neg:,} ({neg/total*100:.1f}%)",
            "Positive Rate": f"{pos/total:.3f}",
        })

    tbl = pd.DataFrame(rows)
    fig, ax = plt.subplots(figsize=(10, 3.5))
    ax.axis("off")
    table = ax.table(cellText=tbl.values, colLabels=tbl.columns, cellLoc="center", loc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.auto_set_column_width(list(range(len(tbl.columns))))
    for (row, col), cell in table.get_celld().items():
        if row == 0:
            cell.set_facecolor("#4472C4")
            cell.set_text_props(color="white", fontweight="bold")
    ax.set_title("Outcome Rates by Semantic Class (Full Dataset)", pad=20)
    fig.savefig(OUTPUT_DIR / "fig22_summary_table.png")
    plt.close(fig)
    print(f"  Fig 22: outcome rates summary table")


def print_correlation_stats(df_edits, df_outcomes):
    merged = df_edits.merge(df_outcomes, on="session_id", how="inner")
    merged["outcome_label"] = merged["outcome_type"].apply(classify_outcome)
    merged = merged[merged["outcome_label"].isin(["positive", "negative"])]
    merged["outcome_binary"] = (merged["outcome_label"] == "positive").astype(int)

    class_map = {"substantive_rewrite": 5, "reorganization": 4, "cosmetic": 1,
                 "rejection": 0, "factual_correction": 3, "tone_adjustment": 2}
    merged["class_ordinal"] = merged["semantic_change_class"].map(class_map)

    r_dist, p_dist = stats.pointbiserialr(merged["outcome_binary"], merged["edit_distance_norm"])
    r_class, p_class = stats.pointbiserialr(merged["outcome_binary"], merged["class_ordinal"])

    print(f"\n  Correlation: edit_distance_norm ↔ outcome: r={r_dist:.4f}, p={p_dist:.4f}")
    print(f"  Correlation: class_ordinal ↔ outcome: r={r_class:.4f}, p={p_class:.4f}")

    for cls in ["substantive_rewrite", "cosmetic", "rejection"]:
        sub = merged[merged["semantic_change_class"] == cls]
        rate = sub["outcome_binary"].mean() if len(sub) > 0 else 0
        print(f"  {cls}: positive rate = {rate:.3f} (N={len(sub):,})")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output: {OUTPUT_DIR}")

    print("Loading full dataset...")
    df_edits, df_outcomes = load_full_dataset()
    print(f"  Edits: {len(df_edits):,} | Outcomes: {len(df_outcomes):,}")
    print(f"  Sessions with outcomes: {df_outcomes['session_id'].nunique():,}")

    print("\nLoading overlap dataset...")
    df_overlap = load_overlap_dataset()
    print(f"  Overlap edits with process data: {len(df_overlap):,}")
    outcomes_in_overlap = df_overlap[df_overlap["outcome_type"].notna()]
    print(f"  Overlap edits with outcomes: {len(outcomes_in_overlap):,}")

    print("\n--- Level 1: Full Dataset (Artifact-Only) ---")
    fig15_edit_class_vs_outcome(df_edits, df_outcomes)
    fig16_edit_distance_by_outcome(df_edits, df_outcomes)
    fig17_confidence_breakdown(df_outcomes)
    fig18_outcome_by_source(df_edits, df_outcomes)
    fig21_confound_control(df_edits, df_outcomes)
    fig22_summary_table(df_edits, df_outcomes, df_overlap)
    print_correlation_stats(df_edits, df_outcomes)

    print("\n--- Level 2: Overlap Subset (Artifact + Process) ---")
    fig19_engagement_vs_outcome(df_overlap)
    fig20_engagement_quartiles(df_overlap)

    print(f"\nAll figures saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
