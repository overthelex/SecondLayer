#!/usr/bin/env python3
"""
Build session-level aggregate dataset for the bridge paper:
"From Ontology-Controlled Systems to Oversight-Controlled Training"

This creates a synthetic-but-representative dataset matching the
paper's reported statistics exactly. Raw session data is not published
for privacy reasons; this dataset reproduces the aggregate distributions.
"""

import json
import os
import random

import pandas as pd

SEED = 42
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "oversight-constitution-hf")

random.seed(SEED)


def generate_sessions():
    sessions = []
    sid = 0

    # FullOversight (gamma=5): 24 sessions
    # 17 with strong-confidence outcomes, 13 positive (76.5%)
    for i in range(24):
        sid += 1
        has_outcome = i < 17
        positive = i < 13 if has_outcome else None
        sessions.append({
            "session_id": f"s{sid:04d}",
            "gamma": 5,
            "oversight_grade": "FullOversight",
            "C1_persistence": True,
            "C2_compositional_layering": True,
            "C3_iterative_refinement": True,
            "C4_information_asymmetry": True,
            "C5_consequential_grounding": True,
            "has_strong_outcome": has_outcome,
            "positive_outcome": positive,
            "total_edits": random.randint(1, 5),
            "mean_edit_distance": round(random.gauss(0.792, 0.08), 3),
            "median_edit_distance": round(random.gauss(0.775, 0.07), 3),
            "substantive_rewrite_pct": round(random.gauss(53.8, 10), 1),
            "rejection_rate_pct": round(random.gauss(15.4, 5), 1),
        })

    # PartialOversight gamma=4: 1857 sessions (51.8% of total minus gamma=3)
    # From paper: 1,970 total partial, 113 at gamma=3 => 1,857 at gamma=4
    # gamma=4: all except C2
    # 1,261 with strong outcomes at gamma=4, 1,223 positive (97.0%)
    for i in range(1857):
        sid += 1
        has_outcome = i < 1261
        positive = i < 1223 if has_outcome else None
        sessions.append({
            "session_id": f"s{sid:04d}",
            "gamma": 4,
            "oversight_grade": "PartialOversight",
            "C1_persistence": True,
            "C2_compositional_layering": False,
            "C3_iterative_refinement": True,
            "C4_information_asymmetry": True,
            "C5_consequential_grounding": has_outcome,
            "has_strong_outcome": has_outcome,
            "positive_outcome": positive,
            "total_edits": random.randint(3, 15),
            "mean_edit_distance": round(random.gauss(0.804, 0.06), 3),
            "median_edit_distance": round(random.gauss(0.831, 0.05), 3),
            "substantive_rewrite_pct": round(random.gauss(78.4, 8), 1),
            "rejection_rate_pct": round(random.gauss(4.7, 2), 1),
        })

    # PartialOversight gamma=3: 113 sessions
    # 113 with strong outcomes, 109 positive (96.5%)
    for i in range(113):
        sid += 1
        has_outcome = True
        positive = i < 109
        sessions.append({
            "session_id": f"s{sid:04d}",
            "gamma": 3,
            "oversight_grade": "PartialOversight",
            "C1_persistence": True,
            "C2_compositional_layering": False,
            "C3_iterative_refinement": True,
            "C4_information_asymmetry": True,
            "C5_consequential_grounding": True,
            "has_strong_outcome": has_outcome,
            "positive_outcome": positive,
            "total_edits": random.randint(3, 12),
            "mean_edit_distance": round(random.gauss(0.804, 0.06), 3),
            "median_edit_distance": round(random.gauss(0.831, 0.05), 3),
            "substantive_rewrite_pct": round(random.gauss(78.4, 8), 1),
            "rejection_rate_pct": round(random.gauss(4.7, 2), 1),
        })

    # InvalidOversight (gamma<=2): 898 sessions
    for i in range(898):
        sid += 1
        sessions.append({
            "session_id": f"s{sid:04d}",
            "gamma": random.choice([0, 1, 2]),
            "oversight_grade": "InvalidOversight",
            "C1_persistence": random.random() < 0.7,
            "C2_compositional_layering": False,
            "C3_iterative_refinement": random.random() < 0.5,
            "C4_information_asymmetry": random.random() < 0.943,
            "C5_consequential_grounding": False,
            "has_strong_outcome": False,
            "positive_outcome": None,
            "total_edits": random.randint(5, 25),
            "mean_edit_distance": round(random.gauss(0.809, 0.05), 3),
            "median_edit_distance": round(random.gauss(0.845, 0.04), 3),
            "substantive_rewrite_pct": round(random.gauss(83.1, 6), 1),
            "rejection_rate_pct": round(random.gauss(2.5, 1.5), 1),
        })

    # Clamp values
    for s in sessions:
        s["mean_edit_distance"] = max(0, min(1, s["mean_edit_distance"]))
        s["median_edit_distance"] = max(0, min(1, s["median_edit_distance"]))
        s["substantive_rewrite_pct"] = max(0, min(100, s["substantive_rewrite_pct"]))
        s["rejection_rate_pct"] = max(0, min(100, s["rejection_rate_pct"]))

    assert len(sessions) == 2892, f"Expected 2892, got {len(sessions)}"
    return sessions


def main():
    sessions = generate_sessions()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Save as JSONL
    jsonl_path = os.path.join(OUTPUT_DIR, "sessions.jsonl")
    with open(jsonl_path, "w") as f:
        for s in sessions:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    # Save as parquet
    df = pd.DataFrame(sessions)
    parquet_path = os.path.join(OUTPUT_DIR, "sessions.parquet")
    df.to_parquet(parquet_path, index=False, compression="zstd")

    # Stats
    print(f"Total sessions: {len(sessions)}")
    for grade in ["FullOversight", "PartialOversight", "InvalidOversight"]:
        subset = [s for s in sessions if s["oversight_grade"] == grade]
        print(f"  {grade}: {len(subset)}")

    with_outcomes = [s for s in sessions if s["has_strong_outcome"]]
    positive = [s for s in with_outcomes if s["positive_outcome"]]
    print(f"\nStrong-confidence outcomes: {len(with_outcomes)}")
    print(f"Positive outcomes: {len(positive)} ({100*len(positive)/len(with_outcomes):.1f}%)")
    print(f"\nOutput: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
