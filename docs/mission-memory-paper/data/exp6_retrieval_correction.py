#!/usr/bin/env python3
"""
Experiment 6: Retrieval-Correction Signal Validation on RAGBench

Goal: Validate that the retrieval-correction signal (operator corrections
caused by insufficient context) correlates with retrieval quality metrics.

Dataset: RAGBench (Galileo AI, 2024) — 100K+ RAG examples across 12 domains
with TRACe annotations: Utilization, Relevance, Adherence, Completeness.

Method:
1. For each example, measure retrieval quality via TRACe metrics
2. Define "correction-needed" proxy: adherence=False OR completeness<0.5
   (the response needed correction because context was insufficient)
3. Show that low relevance/utilization predicts correction-needed
4. Compute correlation between retrieval quality and correction proxy
5. Cross-domain validation: does the pattern hold across all 12 domains?

Mapping to paper:
  - relevance_score ≈ pull-mode retrieval quality (did we fetch the right context?)
  - utilization_score ≈ context efficiency (did the agent use what was fetched?)
  - completeness_score ≈ push-mode adequacy (was all needed context available?)
  - adherence_score ≈ absence of hallucination (did missing context cause confabulation?)
  - correction_needed ≈ retrieval-correction signal
"""

import json
import os
from collections import defaultdict

import numpy as np
from scipy import stats as sp_stats
import pingouin as pg

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "exp6_retrieval_correction.json")

DOMAINS = [
    "covidqa", "cuad", "delucionqa", "emanual", "expertqa", "finqa",
    "hagrid", "hotpotqa", "msmarco", "pubmedqa", "tatqa", "techqa",
]


def load_ragbench() -> list[dict]:
    """Load all RAGBench domains."""
    from datasets import load_dataset

    all_rows = []
    for domain in DOMAINS:
        for split in ["train", "test", "validation"]:
            try:
                ds = load_dataset("galileo-ai/ragbench", domain, split=split)
                for row in ds:
                    row["domain"] = domain
                    row["split"] = split
                    all_rows.append(row)
            except Exception:
                pass
    return all_rows


def analyze(rows: list[dict]) -> dict:
    """Core analysis: correlation between retrieval quality and correction need."""

    # Extract metrics
    records = []
    for r in rows:
        relevance = r.get("relevance_score")
        utilization = r.get("utilization_score")
        completeness = r.get("completeness_score")
        adherence = r.get("adherence_score")
        ragas_faith = r.get("ragas_faithfulness")
        domain = r.get("domain", "?")

        if relevance is None or completeness is None:
            continue

        # Correction-needed proxy: response inadequate due to retrieval failure
        # adherence=False means response contains unsupported claims (hallucination)
        # completeness<0.5 means response misses >50% of answerable content
        correction_needed = (adherence is False) or (completeness is not None and completeness < 0.5)

        records.append({
            "domain": domain,
            "relevance": float(relevance) if relevance is not None else None,
            "utilization": float(utilization) if utilization is not None else None,
            "completeness": float(completeness) if completeness is not None else None,
            "adherence": bool(adherence) if adherence is not None else None,
            "ragas_faithfulness": float(ragas_faith) if ragas_faith is not None else None,
            "correction_needed": correction_needed,
        })

    n = len(records)
    n_correction = sum(1 for r in records if r["correction_needed"])

    # === Global correlations ===
    rel = np.array([r["relevance"] for r in records if r["relevance"] is not None])
    util = np.array([r["utilization"] for r in records if r["utilization"] is not None])
    comp = np.array([r["completeness"] for r in records if r["completeness"] is not None])
    corr_flag = np.array([1.0 if r["correction_needed"] else 0.0 for r in records])

    # Point-biserial correlation: continuous metric vs binary correction flag
    def pb_corr(metric_values, binary, metric_name):
        valid = ~np.isnan(metric_values) if hasattr(metric_values, '__len__') else np.ones(len(binary), dtype=bool)
        if len(metric_values) != len(binary):
            min_len = min(len(metric_values), len(binary))
            metric_values = metric_values[:min_len]
            binary = binary[:min_len]
        r_pb, p_pb = sp_stats.pointbiserialr(binary, metric_values)
        return {
            "r": round(float(r_pb), 4),
            "p": round(float(p_pb), 6),
            "significant": bool(p_pb < 0.001),
            "direction": "lower metric → more corrections" if r_pb < 0 else "higher metric → more corrections",
        }

    corr_rel = pb_corr(rel[:len(corr_flag)], corr_flag[:len(rel)], "relevance")
    corr_util = pb_corr(util[:len(corr_flag)], corr_flag[:len(util)], "utilization")
    corr_comp = pb_corr(comp[:len(corr_flag)], corr_flag[:len(comp)], "completeness")

    # === Group comparison: correction-needed vs not ===
    needs_corr = [r for r in records if r["correction_needed"]]
    no_corr = [r for r in records if not r["correction_needed"]]

    def group_stats(group, metric):
        vals = [r[metric] for r in group if r[metric] is not None]
        if not vals:
            return {"n": 0}
        return {
            "n": len(vals),
            "mean": round(float(np.mean(vals)), 4),
            "median": round(float(np.median(vals)), 4),
            "std": round(float(np.std(vals, ddof=1)), 4) if len(vals) > 1 else 0,
        }

    def compare_groups(metric):
        x = np.array([r[metric] for r in no_corr if r[metric] is not None])
        y = np.array([r[metric] for r in needs_corr if r[metric] is not None])
        if len(x) < 5 or len(y) < 5:
            return {"error": "insufficient data"}

        mwu = pg.mwu(x, y, alternative="greater")
        hg = float(pg.compute_effsize(x, y, eftype="hedges"))

        return {
            "no_correction": group_stats(no_corr, metric),
            "needs_correction": group_stats(needs_corr, metric),
            "delta_mean": round(float(np.mean(x) - np.mean(y)), 4),
            "mann_whitney_U": round(float(mwu["U_val"].iloc[0]), 1),
            "mann_whitney_p": round(float(mwu["p_val"].iloc[0]), 6),
            "hedges_g": round(hg, 3),
            "CLES": round(float(mwu["CLES"].iloc[0]), 3),
        }

    rel_comparison = compare_groups("relevance")
    util_comparison = compare_groups("utilization")
    comp_comparison = compare_groups("completeness")

    # === Per-domain analysis ===
    domain_results = {}
    for domain in set(r["domain"] for r in records):
        d_recs = [r for r in records if r["domain"] == domain]
        d_corr = sum(1 for r in d_recs if r["correction_needed"])
        d_no = len(d_recs) - d_corr

        d_rel_corr = [r["relevance"] for r in d_recs if r["correction_needed"] and r["relevance"] is not None]
        d_rel_no = [r["relevance"] for r in d_recs if not r["correction_needed"] and r["relevance"] is not None]

        domain_results[domain] = {
            "n": len(d_recs),
            "correction_rate": round(d_corr / len(d_recs) * 100, 1) if d_recs else 0,
            "relevance_when_correction": round(float(np.mean(d_rel_corr)), 4) if d_rel_corr else None,
            "relevance_when_ok": round(float(np.mean(d_rel_no)), 4) if d_rel_no else None,
        }

    # === Relevance threshold analysis ===
    thresholds = [0.01, 0.05, 0.1, 0.2, 0.5]
    threshold_results = []
    for thresh in thresholds:
        below = [r for r in records if r["relevance"] is not None and r["relevance"] < thresh]
        above = [r for r in records if r["relevance"] is not None and r["relevance"] >= thresh]
        cr_below = sum(1 for r in below if r["correction_needed"]) / len(below) * 100 if below else 0
        cr_above = sum(1 for r in above if r["correction_needed"]) / len(above) * 100 if above else 0
        threshold_results.append({
            "threshold": thresh,
            "n_below": len(below),
            "n_above": len(above),
            "correction_rate_below": round(cr_below, 1),
            "correction_rate_above": round(cr_above, 1),
            "ratio": round(cr_below / cr_above, 2) if cr_above > 0 else None,
        })

    return {
        "dataset": {
            "name": "RAGBench",
            "source": "HuggingFace galileo-ai/ragbench",
            "reference": "Friel et al., 2024, arXiv:2407.11005",
            "n_total": n,
            "n_domains": len(set(r["domain"] for r in records)),
            "n_correction_needed": n_correction,
            "correction_rate_pct": round(n_correction / n * 100, 1),
        },
        "correlations": {
            "relevance_vs_correction": corr_rel,
            "utilization_vs_correction": corr_util,
            "completeness_vs_correction": corr_comp,
        },
        "group_comparison": {
            "relevance": rel_comparison,
            "utilization": util_comparison,
            "completeness": comp_comparison,
        },
        "threshold_analysis": threshold_results,
        "per_domain": domain_results,
        "paper_mapping": {
            "retrieval_correction_signal": "correction_needed proxy (adherence=False OR completeness<0.5)",
            "pull_mode_quality": "relevance_score — did the system fetch relevant context?",
            "push_mode_adequacy": "completeness_score — was all needed context available?",
            "context_efficiency": "utilization_score — did the agent use fetched context?",
        },
    }


def main():
    print("Loading RAGBench (12 domains, all splits)...")
    rows = load_ragbench()
    print(f"  {len(rows)} total examples")

    print("\nAnalyzing retrieval-correction correlations...")
    results = analyze(rows)

    d = results["dataset"]
    print(f"\n{'='*60}")
    print(f"EXP 6: Retrieval-Correction Signal Validation")
    print(f"{'='*60}")
    print(f"Dataset: {d['n_total']} examples, {d['n_domains']} domains")
    print(f"Correction needed: {d['n_correction_needed']} ({d['correction_rate_pct']}%)")

    print(f"\nCorrelations (point-biserial r with correction flag):")
    for metric, corr in results["correlations"].items():
        sig = "***" if corr["significant"] else "ns"
        print(f"  {metric}: r={corr['r']}, p={corr['p']} {sig} — {corr['direction']}")

    print(f"\nGroup comparison (no-correction vs needs-correction):")
    for metric, comp in results["group_comparison"].items():
        if "error" in comp:
            continue
        nc = comp["no_correction"]
        cr = comp["needs_correction"]
        print(f"  {metric}:")
        print(f"    OK:     mean={nc['mean']}, n={nc['n']}")
        print(f"    Needs:  mean={cr['mean']}, n={cr['n']}")
        print(f"    Hedges' g={comp['hedges_g']}, CLES={comp['CLES']}, p={comp['mann_whitney_p']}")

    print(f"\nThreshold analysis (relevance):")
    for t in results["threshold_analysis"]:
        print(f"  rel<{t['threshold']}: correction rate {t['correction_rate_below']}% "
              f"(n={t['n_below']}) vs ≥{t['threshold']}: {t['correction_rate_above']}% "
              f"(n={t['n_above']}) — ratio {t['ratio']}x")

    print(f"\nPer-domain correction rates:")
    for domain, info in sorted(results["per_domain"].items(), key=lambda x: -x[1]["correction_rate"]):
        rel_ok = info["relevance_when_ok"] or 0
        rel_cr = info["relevance_when_correction"] or 0
        print(f"  {domain}: {info['correction_rate']}% corrections "
              f"(rel OK={rel_ok:.3f}, rel corr={rel_cr:.3f})")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
