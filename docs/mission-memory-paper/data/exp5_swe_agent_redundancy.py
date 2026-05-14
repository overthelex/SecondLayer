#!/usr/bin/env python3
"""
Experiment 7 (paper numbering): Context Redundancy in SWE-Agent Trajectories

Goal: Replicate Exp 3 (context redundancy) on an external dataset of
autonomous agent sessions to validate that the redundancy problem
is universal, not specific to LEX AI.

Dataset: nebius/SWE-agent-trajectories — 80K agent trajectories on SWE-bench.
Each trajectory records the full sequence of agent actions (file reads,
edits, bash commands) when attempting to resolve a GitHub issue.

Method:
1. Parse each trajectory to extract file reads (open_file, cat, search)
   and file edits (edit commands in the trajectory)
2. Compute waste ratio: files read but never edited / total files read
3. Compare successful (target=True) vs failed (target=False) trajectories
4. Analyze whether higher waste predicts failure (retrieval-correction proxy)
5. Compare with LEX AI Exp 3 baseline (60% median waste)

Mapping to paper:
  - File reads = context retrieval (pull-mode)
  - File edits = productive actions
  - Waste ratio = redundancy coefficient W
  - Success/failure = need for correction (failed = correction was needed)
"""

import json
import os
import re
from collections import Counter

import numpy as np
from scipy import stats as sp_stats
import pingouin as pg
import pandas as pd

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "exp5_swe_agent_redundancy.json")


def extract_files_from_trajectory(trajectory: list) -> dict:
    """Extract file reads and edits from a SWE-agent trajectory."""
    files_read = set()
    files_edited = set()
    n_actions = 0
    n_search = 0
    n_open = 0
    n_edit = 0

    for msg in trajectory:
        text = msg.get("text", "") or ""
        role = msg.get("role", "")

        if role != "ai":
            continue
        n_actions += 1

        # Detect file opens: open_file("path") or open path
        for m in re.finditer(r'open\s+(\S+\.(?:py|js|ts|java|rb|go|c|cpp|h|rs|sh|yml|yaml|json|toml|cfg|ini|md|txt|rst))', text):
            files_read.add(m.group(1))
            n_open += 1

        # find_file patterns
        for m in re.finditer(r'find_file\s+"?([^"\s]+)"?', text):
            n_search += 1

        # search_file / search_dir patterns
        for m in re.finditer(r'search_(?:file|dir)\s+"[^"]*"(?:\s+"?([^"\s]+)"?)?', text):
            if m.group(1):
                files_read.add(m.group(1))
            n_search += 1

        # cat commands
        for m in re.finditer(r'cat\s+(\S+\.(?:py|js|ts|java|rb|go|c|cpp|h|rs|sh|yml|yaml|json|toml|cfg|ini|md|txt|rst))', text):
            files_read.add(m.group(1))
            n_open += 1

        # Edit commands
        for m in re.finditer(r'edit\s+\d+:\d+', text):
            n_edit += 1

        # Detect edited files from the observation context
        if role == "ai" and ("edit" in text.lower() or "replace" in text.lower()):
            n_edit += 1

    # Also scan user (observation) messages for file paths shown
    for msg in trajectory:
        text = msg.get("text", "") or ""
        role = msg.get("role", "")
        if role == "user":
            # [File: /path/to/file.py (123 lines total)]
            for m in re.finditer(r'\[File:\s+(/[^\]]+?)\s+\(', text):
                files_read.add(m.group(1))
            # after edit: File updated. Please review the changes
            if "File updated" in text:
                for m in re.finditer(r'\[File:\s+(/[^\]]+?)\s+\(', text):
                    files_edited.add(m.group(1))

    return {
        "files_read": files_read,
        "files_edited": files_edited,
        "n_actions": n_actions,
        "n_search": n_search,
        "n_open": n_open,
        "n_edit": n_edit,
    }


def analyze_trajectories(df: pd.DataFrame) -> dict:
    """Analyze all trajectories for redundancy patterns."""
    records = []
    for _, row in df.iterrows():
        traj = row["trajectory"]
        if not isinstance(traj, (list, np.ndarray)) or len(traj) < 3:
            continue

        info = extract_files_from_trajectory(list(traj))
        reads = info["files_read"]
        edits = info["files_edited"]

        if not reads:
            continue

        wasted = reads - edits
        waste_ratio = len(wasted) / len(reads) if reads else 0

        records.append({
            "instance_id": row["instance_id"],
            "model": row["model_name"],
            "success": bool(row["target"]),
            "n_files_read": len(reads),
            "n_files_edited": len(edits),
            "n_wasted": len(wasted),
            "waste_ratio": round(waste_ratio, 4),
            "n_traj_messages": len(traj),
            "n_agent_actions": info["n_actions"],
        })

    return records


def compute_comparison(records: list[dict]) -> dict:
    """Compare waste ratios: success vs failure, and vs LEX AI baseline."""
    all_waste = np.array([r["waste_ratio"] for r in records])
    success = np.array([r["waste_ratio"] for r in records if r["success"]])
    failure = np.array([r["waste_ratio"] for r in records if not r["success"]])

    def desc(arr, label):
        return {
            "n": len(arr),
            "mean": round(float(np.mean(arr)), 4),
            "median": round(float(np.median(arr)), 4),
            "std": round(float(np.std(arr, ddof=1)), 4) if len(arr) > 1 else 0,
            "p25": round(float(np.percentile(arr, 25)), 4),
            "p75": round(float(np.percentile(arr, 75)), 4),
        }

    overall = desc(all_waste, "all")

    # Success vs failure comparison
    if len(success) >= 5 and len(failure) >= 5:
        mwu = pg.mwu(failure, success, alternative="greater")
        hg = float(pg.compute_effsize(failure, success, eftype="hedges"))
        comparison = {
            "success": desc(success, "success"),
            "failure": desc(failure, "failure"),
            "delta_mean": round(float(np.mean(failure) - np.mean(success)), 4),
            "mann_whitney_U": round(float(mwu["U_val"].iloc[0]), 1),
            "mann_whitney_p": round(float(mwu["p_val"].iloc[0]), 6),
            "hedges_g": round(hg, 3),
            "CLES": round(float(mwu["CLES"].iloc[0]), 3),
        }
    else:
        comparison = {"error": "insufficient success/failure split"}

    # Correlation: waste ratio vs trajectory length
    lengths = np.array([r["n_traj_messages"] for r in records])
    rho, p_rho = sp_stats.spearmanr(all_waste, lengths)

    # Correlation: waste ratio vs success (point-biserial)
    success_flag = np.array([1.0 if r["success"] else 0.0 for r in records])
    r_pb, p_pb = sp_stats.pointbiserialr(success_flag, all_waste)

    # Comparison with LEX AI Exp 3
    lex_median = 0.60
    lex_mean = 0.567
    one_sample = sp_stats.wilcoxon(all_waste - lex_median, alternative="two-sided")

    return {
        "overall": overall,
        "success_vs_failure": comparison,
        "correlations": {
            "waste_vs_traj_length": {
                "spearman_rho": round(float(rho), 4),
                "p": round(float(p_rho), 6),
            },
            "waste_vs_success": {
                "point_biserial_r": round(float(r_pb), 4),
                "p": round(float(p_pb), 6),
                "direction": "higher waste → less success" if r_pb < 0 else "higher waste → more success",
            },
        },
        "comparison_with_lex_ai": {
            "lex_ai_median_waste": lex_median,
            "lex_ai_mean_waste": lex_mean,
            "swe_agent_median_waste": overall["median"],
            "swe_agent_mean_waste": overall["mean"],
            "wilcoxon_p": round(float(one_sample.pvalue), 6),
        },
    }


def main():
    parquet_path = os.path.expanduser(
        "~/.cache/huggingface/hub/datasets--nebius--SWE-agent-trajectories/"
        "snapshots/68195a1450865274106246d0d0296a1d6807b88e/"
        "data/train-00000-of-00012.parquet"
    )

    if not os.path.exists(parquet_path):
        print("Downloading SWE-agent trajectories shard...")
        os.environ['HF_TOKEN'] = os.environ.get('HF_TOKEN', '')
        from huggingface_hub import hf_hub_download
        parquet_path = hf_hub_download(
            repo_id="nebius/SWE-agent-trajectories",
            filename="data/train-00000-of-00012.parquet",
            repo_type="dataset",
        )

    print(f"Loading parquet: {parquet_path}")
    df = pd.read_parquet(parquet_path)
    print(f"  {len(df)} trajectories")
    print(f"  Success rate: {df['target'].mean()*100:.1f}%")
    print(f"  Models: {df['model_name'].nunique()}")

    print("\nExtracting file read/edit patterns...")
    records = analyze_trajectories(df)
    print(f"  {len(records)} trajectories with file reads")

    print("\nComputing statistics...")
    results = compute_comparison(records)

    print(f"\n{'='*60}")
    print(f"EXP 7: Context Redundancy in SWE-Agent Trajectories")
    print(f"{'='*60}")

    o = results["overall"]
    print(f"\nOverall waste ratio: mean={o['mean']}, median={o['median']}, "
          f"std={o['std']} (N={o['n']})")

    sf = results["success_vs_failure"]
    if "error" not in sf:
        print(f"\nSuccess vs Failure:")
        print(f"  Success: mean={sf['success']['mean']}, median={sf['success']['median']} (n={sf['success']['n']})")
        print(f"  Failure: mean={sf['failure']['mean']}, median={sf['failure']['median']} (n={sf['failure']['n']})")
        print(f"  Delta: {sf['delta_mean']}, Hedges' g={sf['hedges_g']}, "
              f"CLES={sf['CLES']}, p={sf['mann_whitney_p']}")

    c = results["correlations"]
    print(f"\nCorrelations:")
    print(f"  Waste vs traj length: rho={c['waste_vs_traj_length']['spearman_rho']}, "
          f"p={c['waste_vs_traj_length']['p']}")
    print(f"  Waste vs success: r={c['waste_vs_success']['point_biserial_r']}, "
          f"p={c['waste_vs_success']['p']} — {c['waste_vs_success']['direction']}")

    lex = results["comparison_with_lex_ai"]
    print(f"\nComparison with LEX AI (Exp 3):")
    print(f"  LEX AI:     median={lex['lex_ai_median_waste']}, mean={lex['lex_ai_mean_waste']}")
    print(f"  SWE-agent:  median={lex['swe_agent_median_waste']}, mean={lex['swe_agent_mean_waste']}")
    print(f"  Wilcoxon p={lex['wilcoxon_p']}")

    # Per-model breakdown
    models = Counter(r["model"] for r in records)
    print(f"\nPer model:")
    for model, count in models.most_common(10):
        m_waste = [r["waste_ratio"] for r in records if r["model"] == model]
        m_succ = [r["success"] for r in records if r["model"] == model]
        print(f"  {model}: n={count}, waste={np.mean(m_waste):.3f}, "
              f"success={sum(m_succ)/len(m_succ)*100:.1f}%")

    output = {
        "experiment": "exp7_swe_agent_redundancy",
        "dataset": {
            "name": "SWE-agent trajectories (nebius/SWE-agent-trajectories)",
            "shard": "train-00000-of-00012 (1/12, ~8.3% of 80K)",
            "n_trajectories": len(df),
            "n_with_reads": len(records),
            "success_rate_pct": round(float(df["target"].mean() * 100), 1),
        },
        "results": results,
        "per_model": {
            model: {
                "n": count,
                "waste_mean": round(float(np.mean([r["waste_ratio"] for r in records if r["model"] == model])), 3),
                "success_pct": round(sum(r["success"] for r in records if r["model"] == model) / count * 100, 1),
            }
            for model, count in models.most_common(10)
        },
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
