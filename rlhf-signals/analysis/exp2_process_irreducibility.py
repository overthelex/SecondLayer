"""
Experiment 2: Process-Level Signal Irreducibility (RQ2)
Model A (artifact-only) vs Model B (artifact+process) comparison

Usage:
  cd rlhf-signals
  pip install -r analysis/requirements.txt
  python3 analysis/exp2_process_irreducibility.py
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
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=FutureWarning)

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://secondlayer@localhost:5432/lex_rlhf_signals")
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output" / "experiment2" / "figures"

plt.style.use("seaborn-v0_8-paper")
plt.rcParams.update({
    "figure.dpi": 300, "savefig.dpi": 300, "font.size": 10,
    "axes.titlesize": 12, "axes.labelsize": 11,
    "figure.figsize": (8, 5), "savefig.bbox": "tight",
})

PROCESS_FEATURES = [
    "active_seconds", "passive_seconds", "idle_seconds",
    "total_key_presses", "idle_gap_count", "apps_touched",
    "research_switches", "voice_context_int", "window_dwell_entropy",
]
ARTIFACT_FEATURES = ["token_count_from", "token_count_to"]


def load_data() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL)
    df = pd.read_sql("""
        SELECT we.edit_id, we.session_id, we.edit_distance_norm,
               we.semantic_change_class, we.edit_seconds,
               fa.token_count AS token_count_from,
               ta.token_count AS token_count_to,
               ee.active_seconds, ee.passive_seconds, ee.idle_seconds,
               ee.total_key_presses, ee.total_mouse_distance, ee.total_clicks,
               ee.idle_gap_count, ee.idle_gap_total_seconds,
               ee.apps_touched, ee.research_switches,
               ee.voice_context, ee.window_dwell_entropy,
               ee.process_data_available, ee.xsistant_rows_matched
        FROM workflow_edits we
        JOIN workflow_artifacts fa ON we.from_artifact_id = fa.artifact_id
        JOIN workflow_artifacts ta ON we.to_artifact_id = ta.artifact_id
        JOIN workflow_edit_engagement ee ON we.edit_id = ee.edit_id
        WHERE ee.process_data_available = true
    """, conn)
    conn.close()
    df["voice_context_int"] = df["voice_context"].astype(int)
    return df


def prepare_binary_target(df: pd.DataFrame) -> pd.DataFrame:
    mask = df["semantic_change_class"].isin(["substantive_rewrite", "cosmetic"])
    subset = df[mask].copy()
    subset["target"] = (subset["semantic_change_class"] == "substantive_rewrite").astype(int)
    return subset


def run_cv(X: pd.DataFrame, y: pd.Series, feature_cols: list[str], model_name: str, n_splits: int = 5):
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    aucs_rf, aucs_lr = [], []
    y_true_all, y_prob_rf_all, y_prob_lr_all = [], [], []

    for train_idx, test_idx in skf.split(X, y):
        X_train, X_test = X.iloc[train_idx][feature_cols], X.iloc[test_idx][feature_cols]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

        X_train = X_train.fillna(0)
        X_test = X_test.fillna(0)

        rf = RandomForestClassifier(n_estimators=500, max_depth=10, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)
        y_prob_rf = rf.predict_proba(X_test)[:, 1]
        aucs_rf.append(roc_auc_score(y_test, y_prob_rf))

        scaler = StandardScaler()
        X_train_sc = scaler.fit_transform(X_train)
        X_test_sc = scaler.transform(X_test)
        lr = LogisticRegression(max_iter=1000, random_state=42)
        lr.fit(X_train_sc, y_train)
        y_prob_lr = lr.predict_proba(X_test)[:, 1]
        aucs_lr.append(roc_auc_score(y_test, y_prob_lr))

        y_true_all.extend(y_test.tolist())
        y_prob_rf_all.extend(y_prob_rf.tolist())
        y_prob_lr_all.extend(y_prob_lr.tolist())

    return {
        "model": model_name,
        "auc_rf_mean": np.mean(aucs_rf), "auc_rf_std": np.std(aucs_rf),
        "auc_lr_mean": np.mean(aucs_lr), "auc_lr_std": np.std(aucs_lr),
        "aucs_rf": aucs_rf, "aucs_lr": aucs_lr,
        "y_true": np.array(y_true_all),
        "y_prob_rf": np.array(y_prob_rf_all),
        "y_prob_lr": np.array(y_prob_lr_all),
    }


def fig7_process_distributions(df: pd.DataFrame):
    features = ["active_seconds", "total_key_presses", "idle_gap_count",
                 "apps_touched", "research_switches", "window_dwell_entropy",
                 "passive_seconds", "idle_seconds", "total_clicks"]
    fig, axes = plt.subplots(3, 3, figsize=(12, 10))
    for ax, feat in zip(axes.flat, features):
        data = df[feat].dropna()
        ax.hist(data, bins=40, color="#1f77b4", alpha=0.7, edgecolor="white")
        ax.set_title(feat.replace("_", " ").title(), fontsize=10)
        ax.set_ylabel("Count")
    fig.suptitle("Process Feature Distributions (N={:,} edits with process data)".format(len(df)), y=1.01)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "fig7_process_feature_distributions.png")
    plt.close(fig)
    print("  Fig 7: process feature distributions")


def fig8_correlation_matrix(df: pd.DataFrame):
    cols = ARTIFACT_FEATURES + PROCESS_FEATURES + ["edit_distance_norm"]
    corr = df[cols].corr()
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="RdBu_r", center=0,
                ax=ax, linewidths=0.5, square=True, cbar_kws={"shrink": 0.8})
    ax.set_title("Feature Correlation Matrix")
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "fig8_correlation_matrix.png")
    plt.close(fig)
    print("  Fig 8: correlation matrix")


def fig9_roc_curves(results_a, results_b):
    fig, ax = plt.subplots(figsize=(8, 6))

    for res, label_prefix, colors in [
        (results_a, "Model A", ("#1f77b4", "#aec7e8")),
        (results_b, "Model B", ("#d62728", "#ff9896")),
    ]:
        fpr_rf, tpr_rf, _ = roc_curve(res["y_true"], res["y_prob_rf"])
        fpr_lr, tpr_lr, _ = roc_curve(res["y_true"], res["y_prob_lr"])

        ax.plot(fpr_rf, tpr_rf, color=colors[0], linewidth=2,
                label=f"{label_prefix} RF (AUC={res['auc_rf_mean']:.3f}±{res['auc_rf_std']:.3f})")
        ax.plot(fpr_lr, tpr_lr, color=colors[1], linewidth=2, linestyle="--",
                label=f"{label_prefix} LR (AUC={res['auc_lr_mean']:.3f}±{res['auc_lr_std']:.3f})")

    ax.plot([0, 1], [0, 1], "k--", alpha=0.3)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curves: Model A (Artifact-Only) vs Model B (Artifact + Process)")
    ax.legend(loc="lower right", fontsize=9)
    fig.savefig(OUTPUT_DIR / "fig9_roc_curves.png")
    plt.close(fig)
    print(f"  Fig 9: ROC curves (A_RF={results_a['auc_rf_mean']:.3f}, B_RF={results_b['auc_rf_mean']:.3f})")


def fig10_shap_summary(df: pd.DataFrame, feature_cols: list[str]):
    try:
        import shap
    except ImportError:
        print("  Fig 10: SKIPPED (shap not installed)")
        return

    subset = prepare_binary_target(df)
    X = subset[feature_cols].fillna(0)
    y = subset["target"]

    rf = RandomForestClassifier(n_estimators=500, max_depth=10, random_state=42, n_jobs=-1)
    rf.fit(X, y)

    explainer = shap.TreeExplainer(rf)
    shap_values = explainer.shap_values(X)

    fig, ax = plt.subplots(figsize=(10, 6))
    shap.summary_plot(shap_values[1] if isinstance(shap_values, list) else shap_values,
                      X, show=False, max_display=len(feature_cols))
    plt.title("SHAP Feature Importance — Model B (Random Forest)")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "fig10_shap_summary.png")
    plt.close()
    print("  Fig 10: SHAP summary")


def fig11_permutation_test(df: pd.DataFrame, results_b_auc: float, n_permutations: int = 1000):
    subset = prepare_binary_target(df)
    all_features = ARTIFACT_FEATURES + PROCESS_FEATURES
    X = subset[all_features].fillna(0)
    y = subset["target"]

    null_aucs = []
    rng = np.random.default_rng(42)

    for i in range(n_permutations):
        X_perm = X.copy()
        for feat in PROCESS_FEATURES:
            X_perm[feat] = rng.permutation(X_perm[feat].values)

        rf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42, n_jobs=-1)
        skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        fold_aucs = []
        for train_idx, test_idx in skf.split(X_perm, y):
            rf.fit(X_perm.iloc[train_idx], y.iloc[train_idx])
            y_prob = rf.predict_proba(X_perm.iloc[test_idx])[:, 1]
            fold_aucs.append(roc_auc_score(y.iloc[test_idx], y_prob))
        null_aucs.append(np.mean(fold_aucs))

        if (i + 1) % 100 == 0:
            print(f"    Permutation {i+1}/{n_permutations}")

    null_aucs = np.array(null_aucs)
    p_value = (null_aucs >= results_b_auc).mean()

    fig, ax = plt.subplots()
    ax.hist(null_aucs, bins=50, color="#aaa", alpha=0.7, edgecolor="white", label="Null distribution")
    ax.axvline(results_b_auc, color="#d62728", linewidth=2, label=f"Observed AUC={results_b_auc:.3f}")
    ax.set_xlabel("AUC (process features permuted)")
    ax.set_ylabel("Count")
    ax.set_title(f"Permutation Test: p={p_value:.4f} (N={n_permutations} permutations)")
    ax.legend()
    fig.savefig(OUTPUT_DIR / "fig11_permutation_test.png")
    plt.close(fig)
    print(f"  Fig 11: permutation test (p={p_value:.4f})")
    return p_value


def fig13_scatter(df: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(8, 6))
    colors = {"substantive_rewrite": "#d62728", "cosmetic": "#2ca02c",
              "reorganization": "#ff7f0e", "rejection": "#1f77b4",
              "factual_correction": "#9467bd", "tone_adjustment": "#8c564b"}
    for cls, color in colors.items():
        mask = df["semantic_change_class"] == cls
        if mask.sum() == 0:
            continue
        ax.scatter(df.loc[mask, "active_seconds"], df.loc[mask, "edit_distance_norm"],
                   alpha=0.3, s=10, color=color, label=cls)
    ax.set_xlabel("Active Seconds (from xsistant)")
    ax.set_ylabel("Normalized Edit Distance")
    ax.set_title("Active Time vs Edit Distance (colored by semantic class)")
    ax.legend(fontsize=8, markerscale=3)
    fig.savefig(OUTPUT_DIR / "fig13_process_vs_artifact_scatter.png")
    plt.close(fig)
    print("  Fig 13: process vs artifact scatter")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output: {OUTPUT_DIR}")
    print("Loading data...")

    df = load_data()
    print(f"Loaded: {len(df):,} edits with process data")

    subset = prepare_binary_target(df)
    print(f"Binary target subset (substantive vs cosmetic): {len(subset):,} edits")
    print(f"  substantive_rewrite: {(subset['target'] == 1).sum():,}")
    print(f"  cosmetic: {(subset['target'] == 0).sum():,}")

    print("\nGenerating figures...")
    fig7_process_distributions(df)
    fig8_correlation_matrix(df)

    print("\nRunning Model A (artifact-only) CV...")
    results_a = run_cv(subset, subset["target"], ARTIFACT_FEATURES, "Model A")
    print(f"  Model A — RF AUC: {results_a['auc_rf_mean']:.3f}±{results_a['auc_rf_std']:.3f}, LR AUC: {results_a['auc_lr_mean']:.3f}±{results_a['auc_lr_std']:.3f}")

    print("Running Model B (artifact + process) CV...")
    all_features = ARTIFACT_FEATURES + PROCESS_FEATURES
    results_b = run_cv(subset, subset["target"], all_features, "Model B")
    print(f"  Model B — RF AUC: {results_b['auc_rf_mean']:.3f}±{results_b['auc_rf_std']:.3f}, LR AUC: {results_b['auc_lr_mean']:.3f}±{results_b['auc_lr_std']:.3f}")

    delta_rf = results_b["auc_rf_mean"] - results_a["auc_rf_mean"]
    delta_lr = results_b["auc_lr_mean"] - results_a["auc_lr_mean"]
    print(f"\n  Delta RF: {delta_rf:+.3f}")
    print(f"  Delta LR: {delta_lr:+.3f}")

    _, p_paired_rf = stats.ttest_rel(results_b["aucs_rf"], results_a["aucs_rf"])
    print(f"  Paired t-test (RF): p={p_paired_rf:.4f}")

    fig9_roc_curves(results_a, results_b)
    fig10_shap_summary(df, all_features)

    print("\nRunning permutation test (1000 iterations)...")
    fig11_permutation_test(df, results_b["auc_rf_mean"], n_permutations=1000)

    fig13_scatter(df)

    print(f"\nAll figures saved to {OUTPUT_DIR}")
    print("\n=== SUMMARY ===")
    print(f"Model A (artifact) RF AUC: {results_a['auc_rf_mean']:.3f}")
    print(f"Model B (art+proc) RF AUC: {results_b['auc_rf_mean']:.3f}")
    print(f"Delta: {delta_rf:+.3f} (paired p={p_paired_rf:.4f})")


if __name__ == "__main__":
    main()
