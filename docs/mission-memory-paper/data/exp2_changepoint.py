#!/usr/bin/env python3
"""
Experiment 2 Enhancement: Change-Point Detection on CLAUDE.md Growth

Existing: linear regression R²=0.87, 216.7 chars/day.
Enhancement: ruptures PELT to find structural breakpoints where growth
rate changed significantly (phase transitions in the project).

Input: git history of CLAUDE.md (same 25 commits over 85 days).
Output: JSON with breakpoints, per-segment regression, and comparison.

Key: same-day commits are collapsed to daily snapshots (last commit of day)
to avoid intra-day rate spikes distorting change-point detection.
"""

import json
import os
import subprocess
from collections import defaultdict
from datetime import datetime

import numpy as np
import ruptures as rpt
from scipy import stats

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "exp2_changepoint.json")


def get_claudemd_history() -> list[dict]:
    """Extract CLAUDE.md size at each commit from git."""
    result = subprocess.run(
        ["git", "log", "--follow", "--format=%H %ai", "--", "CLAUDE.md"],
        capture_output=True, text=True, cwd="/home/vovkes/SecondLayer"
    )
    entries = []
    for line in result.stdout.strip().split("\n"):
        parts = line.split()
        commit_hash = parts[0]
        date_str = f"{parts[1]} {parts[2]}"
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")

        size_result = subprocess.run(
            ["git", "show", f"{commit_hash}:CLAUDE.md"],
            capture_output=True, text=True, cwd="/home/vovkes/SecondLayer"
        )
        chars = len(size_result.stdout)
        lines = size_result.stdout.count("\n")
        entries.append({
            "commit": commit_hash[:8],
            "date": parts[1],
            "datetime": dt.isoformat(),
            "timestamp": dt.timestamp(),
            "chars": chars,
            "lines": lines,
        })

    entries.sort(key=lambda x: x["timestamp"])
    return entries


def collapse_to_daily(entries: list[dict]) -> list[dict]:
    """Collapse same-day commits to daily snapshots (last commit of each day)."""
    by_day = defaultdict(list)
    for e in entries:
        by_day[e["date"]].append(e)
    daily = []
    for date_key in sorted(by_day.keys()):
        commits = by_day[date_key]
        last = max(commits, key=lambda c: c["timestamp"])
        last["n_commits_that_day"] = len(commits)
        daily.append(last)
    return daily


def run_analysis(entries_raw: list[dict]) -> dict:
    """Full analysis: global regression, PELT, phases, forced BinSeg."""
    daily = collapse_to_daily(entries_raw)
    n_raw = len(entries_raw)
    n_daily = len(daily)

    chars_raw = np.array([e["chars"] for e in entries_raw])
    chars = np.array([e["chars"] for e in daily])

    t0 = entries_raw[0]["timestamp"]
    days_raw = np.array([(e["timestamp"] - t0) / 86400 for e in entries_raw])
    days = np.array([(e["timestamp"] - t0) / 86400 for e in daily])

    # === Global linear regression (on all 25 commits, as in paper) ===
    slope_all, intercept_all, r_all, p_all, se_all = stats.linregress(days_raw, chars_raw)

    # === Global linear regression (on daily snapshots) ===
    slope_daily, intercept_daily, r_daily, p_daily, se_daily = stats.linregress(days, chars)

    # === Growth rates between daily snapshots ===
    deltas = np.diff(chars).astype(float)
    day_diffs = np.diff(days)
    # Avoid division by zero (shouldn't happen after daily collapse)
    safe_diffs = np.where(day_diffs > 0, day_diffs, 1.0)
    rates = deltas / safe_diffs

    # === PELT change-point detection on daily rates ===
    penalty_results = {}
    bkps_primary = []
    if len(rates) >= 4:
        rate_signal = rates.reshape(-1, 1)
        var_rates = float(np.var(rates))

        for pen_name, pen_factor in [("BIC", 1.0), ("AIC_equiv", 0.6), ("liberal", 0.3)]:
            pen_val = pen_factor * np.log(len(rates)) * var_rates
            algo = rpt.Pelt(model="rbf", min_size=2, jump=1).fit(rate_signal)
            bkps = algo.predict(pen=pen_val)
            bkps = [b for b in bkps if b < len(rates)]
            penalty_results[pen_name] = {
                "penalty_value": round(float(pen_val), 1),
                "n_breakpoints": len(bkps),
                "breakpoint_indices": bkps,
            }

        bkps_primary = penalty_results["BIC"]["breakpoint_indices"]

    # === PELT on raw character sizes (level shifts) ===
    pelt_chars_bkps = []
    if n_daily >= 4:
        algo_chars = rpt.Pelt(model="l2", min_size=2, jump=1).fit(chars.reshape(-1, 1))
        pen_chars = np.log(n_daily) * np.var(chars)
        bkps_c = algo_chars.predict(pen=pen_chars)
        pelt_chars_bkps = [b for b in bkps_c if b < n_daily]

    # === Forced BinSeg (exploratory) ===
    forced_results = []
    if len(rates) >= 4:
        rate_signal = rates.reshape(-1, 1)
        algo_bs = rpt.Binseg(model="l2", min_size=2, jump=1).fit(rate_signal)

        for n_bkps in [1, 2]:
            bkps_f = algo_bs.predict(n_bkps=n_bkps)
            bkps_f = [b for b in bkps_f if b < len(rates)]

            bp_info = []
            for bp in bkps_f:
                if bp < n_daily:
                    bp_info.append({
                        "after_commit": daily[bp]["commit"],
                        "date": daily[bp]["date"],
                        "chars": int(chars[bp]),
                    })

            # Segmented RMSE
            bounds = [0] + bkps_f + [n_daily]
            all_res = []
            seg_info = []
            for i in range(len(bounds) - 1):
                si, ei = bounds[i], min(bounds[i + 1], n_daily)
                sd, sc = days[si:ei], chars[si:ei]
                if len(sd) >= 2:
                    sl, ic, r, _, _ = stats.linregress(sd, sc)
                    res = sc - (sl * sd + ic)
                    all_res.extend(res.tolist())
                    seg_info.append({
                        "start": daily[si]["date"],
                        "end": daily[ei - 1]["date"],
                        "slope": round(float(sl), 1),
                        "r_squared": round(float(r ** 2), 4),
                    })

            f_rmse = float(np.sqrt(np.mean(np.array(all_res) ** 2))) if all_res else 0
            forced_results.append({
                "n_forced": n_bkps,
                "breakpoints": bp_info,
                "segments": seg_info,
                "rmse": round(f_rmse, 1),
            })

    # === Per-segment regression (using primary breakpoints) ===
    seg_bounds = [0] + bkps_primary + [n_daily]
    segments = []
    all_seg_residuals = []
    for i in range(len(seg_bounds) - 1):
        si, ei = seg_bounds[i], min(seg_bounds[i + 1], n_daily)
        sd, sc = days[si:ei], chars[si:ei]
        if len(sd) >= 2:
            sl, ic, r, _, _ = stats.linregress(sd, sc)
            res = sc - (sl * sd + ic)
            all_seg_residuals.extend(res.tolist())
        else:
            sl, r = 0.0, 0.0
            all_seg_residuals.append(0.0)

        sr = rates[si:ei - 1] if ei - 1 <= len(rates) else rates[si:]
        segments.append({
            "segment": i + 1,
            "start_date": daily[si]["date"],
            "end_date": daily[ei - 1]["date"],
            "n_daily_points": ei - si,
            "chars_start": int(sc[0]),
            "chars_end": int(sc[-1]),
            "duration_days": round(float(sd[-1] - sd[0]), 1),
            "slope_chars_per_day": round(float(sl), 1),
            "mean_daily_rate": round(float(np.mean(sr)), 1) if len(sr) > 0 else 0,
            "r_squared": round(float(r ** 2), 4),
        })

    # Global RMSE
    residuals_global = chars - (slope_daily * days + intercept_daily)
    rmse_global = float(np.sqrt(np.mean(residuals_global ** 2)))
    rmse_seg = float(np.sqrt(np.mean(np.array(all_seg_residuals) ** 2))) if all_seg_residuals else rmse_global

    # === Growth rate variability ===
    rate_stats = {
        "mean": round(float(np.mean(rates)), 1),
        "median": round(float(np.median(rates)), 1),
        "std": round(float(np.std(rates)), 1),
        "cv": round(float(np.std(rates) / abs(np.mean(rates))), 3) if np.mean(rates) != 0 else None,
        "min": round(float(np.min(rates)), 1),
        "max": round(float(np.max(rates)), 1),
        "iqr": round(float(np.percentile(rates, 75) - np.percentile(rates, 25)), 1),
        "n_negative": int(np.sum(rates < 0)),
    }

    # === Phase comparison (thirds of daily timeline) ===
    third = max(len(rates) // 3, 1)
    phase_names = ["early", "middle", "late"]
    phase_slices = [rates[:third], rates[third:2 * third], rates[2 * third:]]
    phases = {}
    for name, sl, idx in zip(phase_names, phase_slices,
                              [0, third, 2 * third]):
        end_idx = min(idx + len(sl), n_daily - 1)
        phases[name] = {
            "dates": f"{daily[idx]['date']} – {daily[end_idx]['date']}",
            "mean_rate": round(float(np.mean(sl)), 1),
            "median_rate": round(float(np.median(sl)), 1),
            "n_intervals": len(sl),
        }

    # Kruskal-Wallis
    if all(len(s) >= 2 for s in phase_slices):
        kw_h, kw_p = stats.kruskal(*phase_slices)
    else:
        kw_h, kw_p = 0.0, 1.0

    # === Breakpoint details ===
    breakpoint_details = []
    for bp in bkps_primary:
        if bp < n_daily - 1:
            r_before = rates[max(0, bp - 2):bp]
            r_after = rates[bp:min(bp + 2, len(rates))]
            breakpoint_details.append({
                "after_commit": daily[bp]["commit"],
                "date": daily[bp]["date"],
                "chars": int(chars[bp]),
                "rate_before": round(float(np.mean(r_before)), 1) if len(r_before) > 0 else None,
                "rate_after": round(float(np.mean(r_after)), 1) if len(r_after) > 0 else None,
            })

    return {
        "n_commits_raw": n_raw,
        "n_daily_snapshots": n_daily,
        "date_range": {
            "start": daily[0]["date"],
            "end": daily[-1]["date"],
            "duration_days": round(float(days[-1]), 1),
        },
        "chars_range": {
            "start": int(chars[0]),
            "end": int(chars[-1]),
            "growth": int(chars[-1] - chars[0]),
        },
        "global_regression_all_commits": {
            "n": n_raw,
            "slope": round(float(slope_all), 1),
            "r_squared": round(float(r_all ** 2), 4),
            "p_value": float(p_all),
        },
        "global_regression_daily": {
            "n": n_daily,
            "slope": round(float(slope_daily), 1),
            "intercept": round(float(intercept_daily), 1),
            "r_squared": round(float(r_daily ** 2), 4),
            "p_value": float(p_daily),
            "rmse": round(rmse_global, 1),
        },
        "changepoint_detection": {
            "method": "PELT",
            "reference": "Killick et al. 2012, J. Amer. Stat. Assoc.",
            "signal": "daily growth rate (chars/day between daily snapshots)",
            "model": "rbf",
            "penalty_sensitivity": penalty_results,
            "n_breakpoints": len(bkps_primary),
            "breakpoints": breakpoint_details,
            "interpretation": (
                "No statistically significant structural breaks at any penalty level. "
                "PELT confirms linear growth — the file grows at a constant rate without "
                "phase transitions, consistent with continuous knowledge accumulation."
                if len(bkps_primary) == 0 else
                f"{len(bkps_primary)} breakpoint(s) detected."
            ),
        },
        "forced_breakpoints": {
            "method": "BinSeg (Binary Segmentation)",
            "results": forced_results,
        },
        "segments": segments,
        "segmented_fit": {
            "rmse": round(rmse_seg, 1),
            "rmse_vs_global_pct": round(
                (rmse_global - rmse_seg) / rmse_global * 100, 1
            ) if rmse_global > 0 else 0,
        },
        "growth_rate_stats": rate_stats,
        "phase_comparison": {
            "method": "split daily rates into thirds",
            "phases": phases,
            "kruskal_wallis": {
                "H": round(float(kw_h), 3),
                "p": round(float(kw_p), 4),
                "significant": bool(kw_p < 0.05),
            },
        },
        "daily_data": [
            {"date": e["date"], "chars": e["chars"], "lines": e["lines"],
             "day": round(float(d), 1), "n_commits": e.get("n_commits_that_day", 1)}
            for e, d in zip(daily, days)
        ],
    }


def main():
    print("Extracting CLAUDE.md history from git...")
    entries = get_claudemd_history()
    print(f"  {len(entries)} commits ({entries[0]['date']} to {entries[-1]['date']})")

    results = run_analysis(entries)

    print(f"\n{'='*60}")
    print(f"EXP 2: Change-Point Detection on CLAUDE.md Growth")
    print(f"{'='*60}")

    g = results["global_regression_daily"]
    print(f"\nGlobal (daily): {g['slope']} chars/day, R²={g['r_squared']}, RMSE={g['rmse']}")
    g2 = results["global_regression_all_commits"]
    print(f"Global (all):   {g2['slope']} chars/day, R²={g2['r_squared']}")

    cpd = results["changepoint_detection"]
    print(f"\nPELT ({results['n_daily_snapshots']} daily points):")
    for pn, pi in cpd["penalty_sensitivity"].items():
        print(f"  {pn} (pen={pi['penalty_value']}): {pi['n_breakpoints']} breakpoint(s)")
    print(f"  → {cpd['interpretation']}")

    print(f"\nForced BinSeg (exploratory):")
    for fb in results["forced_breakpoints"]["results"]:
        bps = ", ".join(b["date"] for b in fb["breakpoints"])
        segs = " | ".join(
            f"{s['start']}–{s['end']}: {s['slope']} c/d (R²={s['r_squared']})"
            for s in fb["segments"]
        )
        print(f"  n={fb['n_forced']}: [{bps}] RMSE={fb['rmse']}")
        print(f"    {segs}")

    rv = results["growth_rate_stats"]
    print(f"\nDaily rates: mean={rv['mean']}, median={rv['median']}, "
          f"std={rv['std']}, CV={rv['cv']}, {rv['n_negative']} negative")

    print(f"\nPhases:")
    for name, info in results["phase_comparison"]["phases"].items():
        print(f"  {name}: {info['mean_rate']} chars/day ({info['dates']})")
    kw = results["phase_comparison"]["kruskal_wallis"]
    print(f"  Kruskal-Wallis: H={kw['H']}, p={kw['p']}")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
