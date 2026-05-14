#!/usr/bin/env python3
"""
Citation Graph Paper — Experiment 6: Citation Prediction.

Tests whether early citation patterns predict future importance of legislation.
Uses citation_year_stats (pre-aggregated) to avoid 502M-row joins.

Methodology:
  1. Split data into training (2007-2019) and test (2020-2025) periods
  2. Extract features: early growth rate, cross-year consistency, citation rank
  3. Train logistic regression to predict "top-1000" status in test period
  4. Evaluate with AUC-ROC, precision@k, confusion matrix

Usage:
  python3 analyze-prediction.py
"""

import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import psycopg2

DB_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://secondlayer:local_dev_password@127.0.0.1:5432/secondlayer_local",
)

OUTPUT_DIR = Path(__file__).parent / "output"


def get_conn(statement_timeout: str = "2h"):
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = %s", (statement_timeout,))
    cur.close()
    return conn


def fmt_duration(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h {m}m {s}s"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("EXPERIMENT 6: Citation Prediction — Early Signals of Legal Importance")
    print("=" * 70)

    TRAIN_YEARS = range(2007, 2020)  # 2007-2019
    TEST_YEARS = range(2020, 2027)   # 2020-2026
    TOP_K = 1000

    t0 = time.time()
    conn = get_conn()
    cur = conn.cursor()

    # Step 1: Load per-article, per-year citation counts
    print("\n[1/6] Loading citation_year_stats...")
    t1 = time.time()

    cur.execute("""
        SELECT law_number, law_article, year, SUM(citations)::bigint AS cites
        FROM citation_year_stats
        WHERE law_number IS NOT NULL AND law_number != ''
          AND law_article IS NOT NULL AND law_article != ''
          AND year BETWEEN 2007 AND 2026
        GROUP BY law_number, law_article, year
        ORDER BY law_number, law_article, year
    """)

    article_years = defaultdict(dict)  # (law, art) -> {year: count}
    rows = 0
    for law_number, law_article, year, cites in cur:
        article_years[(law_number, law_article)][int(year)] = int(cites)
        rows += 1

    print(f"  Loaded {rows:,} (article, year) pairs for {len(article_years):,} unique articles")
    print(f"  Query time: {fmt_duration(time.time() - t1)}")

    cur.close()
    conn.close()

    # Step 2: Compute train/test period totals
    print("\n[2/6] Computing train/test period totals...")

    articles = []
    for (law_number, law_article), year_counts in article_years.items():
        train_total = sum(year_counts.get(y, 0) for y in TRAIN_YEARS)
        test_total = sum(year_counts.get(y, 0) for y in TEST_YEARS)

        # Only consider articles that exist in training period
        if train_total == 0:
            continue

        train_years_active = sum(1 for y in TRAIN_YEARS if year_counts.get(y, 0) > 0)
        test_years_active = sum(1 for y in TEST_YEARS if year_counts.get(y, 0) > 0)

        # Early growth: citations in first 3 active years vs last 3
        active_years_sorted = sorted(y for y in TRAIN_YEARS if year_counts.get(y, 0) > 0)
        if len(active_years_sorted) >= 6:
            early = sum(year_counts.get(y, 0) for y in active_years_sorted[:3])
            late = sum(year_counts.get(y, 0) for y in active_years_sorted[-3:])
            growth_ratio = late / max(early, 1)
        else:
            growth_ratio = 1.0

        # Year-over-year consistency (coefficient of variation)
        train_values = [year_counts.get(y, 0) for y in TRAIN_YEARS if year_counts.get(y, 0) > 0]
        if len(train_values) >= 2:
            cv = np.std(train_values) / max(np.mean(train_values), 1)
        else:
            cv = 0.0

        articles.append({
            "law_number": law_number,
            "law_article": law_article,
            "train_total": train_total,
            "test_total": test_total,
            "train_years_active": train_years_active,
            "test_years_active": test_years_active,
            "growth_ratio": growth_ratio,
            "cv": cv,
        })

    # Sort by test_total to determine "top-K" label
    articles.sort(key=lambda a: -a["test_total"])

    # Mark top-K articles in test period as positive class
    top_k_set = set()
    for i, a in enumerate(articles):
        a["is_top_k"] = i < TOP_K
        if a["is_top_k"]:
            top_k_set.add((a["law_number"], a["law_article"]))

    print(f"  Articles with train data: {len(articles):,}")
    print(f"  Top-{TOP_K} test-period articles labeled as positive class")
    print(f"  Top-{TOP_K} test threshold: {articles[TOP_K - 1]['test_total']:,} test citations")

    # Step 3: Build feature matrix
    print("\n[3/6] Building feature matrix...")

    from sklearn.preprocessing import StandardScaler
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import (
        roc_auc_score,
        precision_score,
        recall_score,
        f1_score,
        confusion_matrix,
        average_precision_score,
    )

    feature_names = [
        "log_train_total",
        "train_years_active",
        "growth_ratio",
        "cv",
        "log_train_total_x_years",
    ]

    X = np.zeros((len(articles), len(feature_names)))
    y = np.zeros(len(articles))

    for i, a in enumerate(articles):
        X[i, 0] = np.log1p(a["train_total"])
        X[i, 1] = a["train_years_active"]
        X[i, 2] = min(a["growth_ratio"], 100)  # cap outliers
        X[i, 3] = min(a["cv"], 10)              # cap outliers
        X[i, 4] = np.log1p(a["train_total"]) * a["train_years_active"]
        y[i] = 1.0 if a["is_top_k"] else 0.0

    print(f"  Feature matrix: {X.shape}")
    print(f"  Positive class: {int(y.sum()):,}, Negative: {int(len(y) - y.sum()):,}")
    print(f"  Class ratio: {y.mean():.4%}")

    # Step 4: Train/evaluate with cross-validation
    print("\n[4/6] Training logistic regression...")

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Full dataset train (for coefficients & final metrics)
    model = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
    model.fit(X_scaled, y)

    y_prob = model.predict_proba(X_scaled)[:, 1]
    y_pred = model.predict(X_scaled)

    auc = roc_auc_score(y, y_prob)
    ap = average_precision_score(y, y_prob)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)
    f1 = f1_score(y, y_pred)
    cm = confusion_matrix(y, y_pred)

    print(f"  AUC-ROC: {auc:.4f}")
    print(f"  Average Precision: {ap:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall: {rec:.4f}")
    print(f"  F1: {f1:.4f}")
    print(f"  Confusion matrix:\n{cm}")

    # Feature importance
    print("\n  Feature coefficients:")
    for name, coef in zip(feature_names, model.coef_[0]):
        print(f"    {name:30s}: {coef:+.4f}")

    # Step 5: Precision@K analysis
    print("\n[5/6] Precision@K analysis...")

    sorted_indices = np.argsort(-y_prob)
    precision_at_k = {}
    for k in [100, 250, 500, 1000, 2000, 5000]:
        if k > len(articles):
            break
        top_k_pred = sorted_indices[:k]
        hits = sum(y[idx] for idx in top_k_pred)
        p_at_k = hits / k
        precision_at_k[k] = round(p_at_k, 4)
        print(f"  P@{k}: {p_at_k:.4f} ({int(hits)}/{k} true positives)")

    # Step 6: Analyze prediction errors
    print("\n[6/6] Analyzing interesting cases...")

    # "Surprise risers" — low train score but top-K in test
    surprise_risers = []
    for i, a in enumerate(articles):
        if a["is_top_k"] and a["train_total"] < 100:
            surprise_risers.append({
                "law_number": a["law_number"],
                "law_article": a["law_article"],
                "train_total": a["train_total"],
                "test_total": a["test_total"],
                "predicted_prob": round(float(y_prob[i]), 4),
            })

    surprise_risers.sort(key=lambda x: -x["test_total"])
    print(f"\n  Surprise risers (train < 100, test top-{TOP_K}): {len(surprise_risers)}")
    for r in surprise_risers[:10]:
        print(f"    {r['law_number'][:40]} ст.{r['law_article']}: "
              f"train={r['train_total']:,}, test={r['test_total']:,}, "
              f"p={r['predicted_prob']:.3f}")

    # "Fallen stars" — high train but not in top-K test
    fallen_stars = []
    # Sort articles by train_total desc to find high-train articles
    articles_by_train = sorted(articles, key=lambda a: -a["train_total"])
    for a in articles_by_train[:2000]:  # top-2000 train
        if not a["is_top_k"]:
            idx = articles.index(a)
            fallen_stars.append({
                "law_number": a["law_number"],
                "law_article": a["law_article"],
                "train_total": a["train_total"],
                "test_total": a["test_total"],
                "predicted_prob": round(float(y_prob[idx]), 4),
            })

    fallen_stars.sort(key=lambda x: -x["train_total"])
    print(f"\n  Fallen stars (top-2000 train, not top-{TOP_K} test): {len(fallen_stars)}")
    for f in fallen_stars[:10]:
        print(f"    {f['law_number'][:40]} ст.{f['law_article']}: "
              f"train={f['train_total']:,}, test={f['test_total']:,}, "
              f"p={f['predicted_prob']:.3f}")

    elapsed = time.time() - t0
    print(f"\nExperiment 6 completed in {fmt_duration(elapsed)}")

    # Save results
    results = {
        "experiment": 6,
        "description": "Citation prediction — early signals of legal importance",
        "train_period": "2007-2019",
        "test_period": "2020-2026",
        "top_k": TOP_K,
        "n_articles": len(articles),
        "positive_class": int(y.sum()),
        "metrics": {
            "auc_roc": round(auc, 4),
            "average_precision": round(ap, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "confusion_matrix": cm.tolist(),
        },
        "feature_coefficients": {
            name: round(float(coef), 4)
            for name, coef in zip(feature_names, model.coef_[0])
        },
        "precision_at_k": precision_at_k,
        "surprise_risers": surprise_risers[:20],
        "fallen_stars": fallen_stars[:20],
        "elapsed_sec": round(elapsed, 1),
    }

    out_path = OUTPUT_DIR / "experiment6-prediction.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print(f"Results saved to {out_path}")

    # Plot ROC curve and precision@k
    _plot_experiment_6(y, y_prob, precision_at_k, feature_names, model.coef_[0])


def _plot_experiment_6(y, y_prob, precision_at_k, feature_names, coefficients):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import roc_curve
    except ImportError:
        print("  [warn] matplotlib not available, skipping plots")
        return

    fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    # Plot 1: ROC curve
    ax = axes[0]
    fpr, tpr, _ = roc_curve(y, y_prob)
    auc = np.trapezoid(tpr, fpr) if hasattr(np, 'trapezoid') else np.trapz(tpr, fpr)
    ax.plot(fpr, tpr, color="#4e79a7", lw=2, label=f"AUC = {auc:.3f}")
    ax.plot([0, 1], [0, 1], color="gray", linestyle="--", alpha=0.5)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve")
    ax.legend()

    # Plot 2: Precision@K
    ax = axes[1]
    ks = sorted(precision_at_k.keys())
    vals = [precision_at_k[k] for k in ks]
    ax.plot(ks, vals, "o-", color="#e15759", lw=2, markersize=8)
    ax.set_xlabel("K")
    ax.set_ylabel("Precision@K")
    ax.set_title("Precision at Top-K")
    ax.set_ylim(0, 1.05)
    for k, v in zip(ks, vals):
        ax.annotate(f"{v:.2f}", (k, v), textcoords="offset points",
                    xytext=(0, 10), ha="center", fontsize=9)

    # Plot 3: Feature importance
    ax = axes[2]
    y_pos = np.arange(len(feature_names))
    colors = ["#59a14f" if c > 0 else "#e15759" for c in coefficients]
    ax.barh(y_pos, coefficients, color=colors)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(feature_names, fontsize=9)
    ax.set_xlabel("Coefficient")
    ax.set_title("Feature Coefficients")
    ax.axvline(x=0, color="gray", linestyle="-", alpha=0.3)

    plt.suptitle("Experiment 6: Citation Prediction", fontsize=14)
    plt.tight_layout()

    out_path = OUTPUT_DIR / "experiment6-prediction.png"
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Plot saved to {out_path}")


if __name__ == "__main__":
    main()
