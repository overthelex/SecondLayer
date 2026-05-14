#!/usr/bin/env python3
"""
Experiment 7: Cross-Domain Validation of Rotation Cost on DevGPT

Goal: Replicate the rotation cost finding (Exp 4) on an external dataset
to address the "single project, single practitioner" limitation.

Dataset: DevGPT (NAIST-SE, MSR 2024) — 1,576 developer-ChatGPT interactions
linked to GitHub artifacts (PRs, commits, issues) across 500+ repos.

Method: For developers with 2+ interactions, order chronologically.
Classify consecutive pairs as "continuation" (same repo) vs "switch"
(different repo). Compare prompt token overhead as a proxy for
initialization cost — switching repos requires more context explanation.

Proxy mapping to paper metrics:
  - Prompt tokens ≈ initialization cost T (more context needed → longer prompts)
  - Conversation turns ≈ retrieval rounds (more turns → more information seeking)
  - Code-to-prompt ratio ≈ efficiency (lower ratio → more overhead)
"""

import json
import os
from collections import defaultdict
from datetime import datetime

import numpy as np
from scipy import stats as sp_stats
import pingouin as pg

DEVGPT_DIR = "/tmp/DevGPT/snapshot_20231012"
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "exp7_devgpt_rotation.json")


def load_devgpt() -> list[dict]:
    """Load all DevGPT sharing records with conversations."""
    records = []
    for fname, rtype in [
        ("20231012_233628_pr_sharings.json", "pr"),
        ("20231012_230826_commit_sharings.json", "commit"),
        ("20231012_235128_issue_sharings.json", "issue"),
    ]:
        path = os.path.join(DEVGPT_DIR, fname)
        with open(path) as f:
            data = json.load(f)
        key = list(data.keys())[0]
        for item in data[key]:
            author = item.get("Author", "")
            repo = item.get("RepoName", "")
            lang = item.get("RepoLanguage", "")
            for s in item.get("ChatgptSharing", []):
                convs = s.get("Conversations", [])
                if not convs:
                    continue

                ts = None
                for ts_str in [
                    item.get("CreatedAt"),
                    item.get("CommitAt"),
                    item.get("AuthorAt"),
                ]:
                    if not ts_str:
                        continue
                    try:
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        break
                    except (ValueError, TypeError):
                        continue

                if ts is None:
                    doc = s.get("DateOfConversation", "")
                    if doc:
                        try:
                            ts = datetime.strptime(doc, "%B %d, %Y")
                        except ValueError:
                            continue
                    else:
                        continue

                n_prompts = s.get("NumberOfPrompts", 0) or len(convs)
                tok_prompts = s.get("TokensOfPrompts", 0) or 0
                tok_answers = s.get("TokensOfAnswers", 0) or 0
                n_code = sum(len(c.get("ListOfCode", [])) for c in convs)
                prompt_lengths = [len(c.get("Prompt", "")) for c in convs]
                first_prompt_len = prompt_lengths[0] if prompt_lengths else 0

                records.append({
                    "author": author,
                    "repo": repo,
                    "language": lang,
                    "type": rtype,
                    "timestamp": ts.timestamp(),
                    "ts_iso": ts.isoformat(),
                    "n_prompts": n_prompts,
                    "tok_prompts": tok_prompts,
                    "tok_answers": tok_answers,
                    "n_code_snippets": n_code,
                    "first_prompt_chars": first_prompt_len,
                    "total_prompt_chars": sum(prompt_lengths),
                })
    return records


def hedges_g(x: np.ndarray, y: np.ndarray) -> float:
    """Hedges' g with small-sample correction."""
    nx, ny = len(x), len(y)
    if nx < 2 or ny < 2:
        return 0.0
    pooled = np.sqrt(
        ((nx - 1) * np.var(x, ddof=1) + (ny - 1) * np.var(y, ddof=1))
        / (nx + ny - 2)
    )
    if pooled == 0:
        return 0.0
    d = (np.mean(y) - np.mean(x)) / pooled
    J = 1 - 3 / (4 * (nx + ny - 2) - 1)
    return d * J


def permutation_test(x: np.ndarray, y: np.ndarray, n_perm: int = 50000) -> dict:
    """Two-sided permutation test for difference in means."""
    obs = np.mean(y) - np.mean(x)
    combined = np.concatenate([x, y])
    rng = np.random.default_rng(42)
    count = 0
    for _ in range(n_perm):
        p = rng.permutation(combined)
        d = np.mean(p[len(x):]) - np.mean(p[:len(x)])
        if abs(d) >= abs(obs):
            count += 1
    return {
        "observed_diff": round(float(obs), 2),
        "p_two_sided": round(count / n_perm, 4),
        "n_permutations": n_perm,
    }


def analyze_rotation(records: list[dict]) -> dict:
    """Core rotation analysis: continuation vs switch."""
    by_author = defaultdict(list)
    for r in records:
        if r["author"] and r["tok_prompts"] > 0:
            by_author[r["author"]].append(r)

    # Build consecutive pairs per author
    cont_metrics = []
    switch_metrics = []
    all_pairs = []

    for author, recs in by_author.items():
        if len(recs) < 2:
            continue
        recs_sorted = sorted(recs, key=lambda x: x["timestamp"])

        for i in range(len(recs_sorted) - 1):
            a = recs_sorted[i]
            b = recs_sorted[i + 1]

            is_same_repo = a["repo"] == b["repo"]
            is_same_lang = a["language"] == b["language"]
            gap_hours = (b["timestamp"] - a["timestamp"]) / 3600

            pair = {
                "author": author,
                "repo_a": a["repo"],
                "repo_b": b["repo"],
                "is_continuation": is_same_repo,
                "is_same_language": is_same_lang,
                "gap_hours": round(gap_hours, 1),
                "tok_prompts_b": b["tok_prompts"],
                "n_prompts_b": b["n_prompts"],
                "first_prompt_chars_b": b["first_prompt_chars"],
                "n_code_b": b["n_code_snippets"],
            }
            all_pairs.append(pair)

            metrics = {
                "tok_prompts": b["tok_prompts"],
                "n_prompts": b["n_prompts"],
                "first_prompt_chars": b["first_prompt_chars"],
            }
            if is_same_repo:
                cont_metrics.append(metrics)
            else:
                switch_metrics.append(metrics)

    return all_pairs, cont_metrics, switch_metrics


def compute_stats(cont: list[dict], switch: list[dict], metric: str) -> dict:
    """Compute all statistics for a given metric."""
    x = np.array([m[metric] for m in cont], dtype=float)
    y = np.array([m[metric] for m in switch], dtype=float)

    # Filter zeros
    x = x[x > 0]
    y = y[y > 0]

    if len(x) < 5 or len(y) < 5:
        return {"error": f"Too few non-zero values: cont={len(x)}, switch={len(y)}"}

    # Descriptive
    desc = {
        "continuation": {
            "n": int(len(x)),
            "mean": round(float(np.mean(x)), 1),
            "median": round(float(np.median(x)), 1),
            "std": round(float(np.std(x, ddof=1)), 1),
        },
        "switch": {
            "n": int(len(y)),
            "mean": round(float(np.mean(y)), 1),
            "median": round(float(np.median(y)), 1),
            "std": round(float(np.std(y, ddof=1)), 1),
        },
        "delta_mean": round(float(np.mean(y) - np.mean(x)), 1),
        "delta_median": round(float(np.median(y) - np.median(x)), 1),
        "delta_pct": round(float((np.mean(y) - np.mean(x)) / np.mean(x) * 100), 1) if np.mean(x) > 0 else None,
    }

    # Mann-Whitney U
    mwu = pg.mwu(y, x, alternative="greater")
    mwu_result = {
        "U": round(float(mwu["U_val"].iloc[0]), 1),
        "p_one_sided": round(float(mwu["p_val"].iloc[0]), 4),
        "RBC": round(float(mwu["RBC"].iloc[0]), 3),
        "CLES": round(float(mwu["CLES"].iloc[0]), 3),
    }

    # Effect sizes
    hg = hedges_g(x, y)

    # Bootstrap CI for Hedges' g
    rng = np.random.default_rng(42)
    boot_gs = []
    for _ in range(10000):
        bx = rng.choice(x, size=len(x), replace=True)
        by = rng.choice(y, size=len(y), replace=True)
        boot_gs.append(hedges_g(bx, by))
    boot_gs = np.array(boot_gs)
    ci = [round(float(np.percentile(boot_gs, 2.5)), 3),
          round(float(np.percentile(boot_gs, 97.5)), 3)]

    effects = {
        "hedges_g": round(hg, 3),
        "hedges_g_ci_95": ci,
        "cohens_d": round(float(pg.compute_effsize(y, x, eftype="cohen")), 3),
    }

    # Permutation test
    perm = permutation_test(x, y)

    return {
        "descriptive": desc,
        "mann_whitney": mwu_result,
        "effect_sizes": effects,
        "permutation_test": perm,
    }


def main():
    print("Loading DevGPT data...")
    records = load_devgpt()
    print(f"  {len(records)} interaction records")

    authors = set(r["author"] for r in records)
    repos = set(r["repo"] for r in records)
    print(f"  {len(authors)} unique authors, {len(repos)} unique repos")

    print("\nAnalyzing rotation patterns...")
    all_pairs, cont, switch = analyze_rotation(records)
    print(f"  Total pairs: {len(all_pairs)}")
    print(f"  Continuation (same repo): {len(cont)}")
    print(f"  Switch (different repo): {len(switch)}")

    # Primary metric: prompt tokens
    print(f"\n{'='*60}")
    print("METRIC 1: Prompt Tokens (proxy for initialization cost)")
    print(f"{'='*60}")
    tok_stats = compute_stats(cont, switch, "tok_prompts")
    d = tok_stats["descriptive"]
    print(f"  Continuation: mean={d['continuation']['mean']}, median={d['continuation']['median']}")
    print(f"  Switch:       mean={d['switch']['mean']}, median={d['switch']['median']}")
    print(f"  Delta: {d['delta_mean']} tokens ({d['delta_pct']}%)")
    mw = tok_stats["mann_whitney"]
    print(f"  Mann-Whitney: U={mw['U']}, p={mw['p_one_sided']}, CLES={mw['CLES']}")
    ef = tok_stats["effect_sizes"]
    print(f"  Hedges' g={ef['hedges_g']} {ef['hedges_g_ci_95']}")
    pt = tok_stats["permutation_test"]
    print(f"  Permutation: p={pt['p_two_sided']}")

    # Secondary metric: number of prompts (conversation turns)
    print(f"\n{'='*60}")
    print("METRIC 2: Number of Prompts (proxy for retrieval rounds)")
    print(f"{'='*60}")
    nprom_stats = compute_stats(cont, switch, "n_prompts")
    d2 = nprom_stats["descriptive"]
    print(f"  Continuation: mean={d2['continuation']['mean']}, median={d2['continuation']['median']}")
    print(f"  Switch:       mean={d2['switch']['mean']}, median={d2['switch']['median']}")
    print(f"  Delta: {d2['delta_mean']} prompts ({d2['delta_pct']}%)")
    mw2 = nprom_stats["mann_whitney"]
    print(f"  Mann-Whitney: U={mw2['U']}, p={mw2['p_one_sided']}, CLES={mw2['CLES']}")
    ef2 = nprom_stats["effect_sizes"]
    print(f"  Hedges' g={ef2['hedges_g']} {ef2['hedges_g_ci_95']}")

    # Tertiary: first prompt length
    print(f"\n{'='*60}")
    print("METRIC 3: First Prompt Length (context explanation overhead)")
    print(f"{'='*60}")
    fp_stats = compute_stats(cont, switch, "first_prompt_chars")
    d3 = fp_stats["descriptive"]
    print(f"  Continuation: mean={d3['continuation']['mean']}, median={d3['continuation']['median']}")
    print(f"  Switch:       mean={d3['switch']['mean']}, median={d3['switch']['median']}")
    print(f"  Delta: {d3['delta_mean']} chars ({d3['delta_pct']}%)")
    mw3 = fp_stats["mann_whitney"]
    print(f"  Mann-Whitney: U={mw3['U']}, p={mw3['p_one_sided']}, CLES={mw3['CLES']}")
    ef3 = fp_stats["effect_sizes"]
    print(f"  Hedges' g={ef3['hedges_g']} {ef3['hedges_g_ci_95']}")

    # Cross-language analysis
    same_lang_switch = [p for p in all_pairs if not p["is_continuation"] and p["is_same_language"]]
    diff_lang_switch = [p for p in all_pairs if not p["is_continuation"] and not p["is_same_language"]]
    print(f"\n{'='*60}")
    print("Cross-language breakdown of switches:")
    print(f"  Same language switches: {len(same_lang_switch)}")
    print(f"  Different language switches: {len(diff_lang_switch)}")
    if same_lang_switch and diff_lang_switch:
        sl_tok = np.array([p["tok_prompts_b"] for p in same_lang_switch if p["tok_prompts_b"] > 0])
        dl_tok = np.array([p["tok_prompts_b"] for p in diff_lang_switch if p["tok_prompts_b"] > 0])
        if len(sl_tok) >= 3 and len(dl_tok) >= 3:
            print(f"  Same-lang switch tokens: mean={np.mean(sl_tok):.0f}")
            print(f"  Diff-lang switch tokens: mean={np.mean(dl_tok):.0f}")

    # Build output
    results = {
        "experiment": "exp7_devgpt_rotation",
        "dataset": {
            "name": "DevGPT",
            "source": "Zenodo DOI 10.5281/zenodo.16392320",
            "reference": "Xiao et al., MSR 2024",
            "snapshot": "20231012",
            "total_records": len(records),
            "unique_authors": len(authors),
            "unique_repos": len(repos),
        },
        "pairs": {
            "total": len(all_pairs),
            "continuation": len(cont),
            "switch": len(switch),
        },
        "prompt_tokens": tok_stats,
        "n_prompts": nprom_stats,
        "first_prompt_length": fp_stats,
        "cross_language": {
            "same_lang_switches": len(same_lang_switch),
            "diff_lang_switches": len(diff_lang_switch),
        },
        "comparison_with_exp4": {
            "exp4_hedges_g": 0.284,
            "exp4_cles": 0.60,
            "exp4_metric": "file read waste ratio",
            "exp7_hedges_g_tokens": ef["hedges_g"],
            "exp7_cles_tokens": mw["CLES"],
            "exp7_metric": "prompt tokens (initialization cost proxy)",
        },
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
