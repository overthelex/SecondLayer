#!/usr/bin/env python3
"""
Experiment 4: Operator Rotation Ablation Study

Measures the "rotation cost" — the additional context waste incurred when
an operator starts a session without practitioner-layer memory from prior
sessions on the same component.

Methodology:
1. Parse all SecondLayer JSONL transcripts
2. Extract: timestamp, task prompt, files read, files edited, components touched
3. Order chronologically, create consecutive session pairs
4. Classify pairs as "continuation" (overlapping components) vs "switch" (disjoint)
5. Compare waste metrics between conditions
6. The delta = the rotation cost that the practitioner layer eliminates

Output: JSON with results for the paper (Experiment 4).
"""

import json
import os
import glob
import re
from collections import defaultdict
from datetime import datetime
import statistics

TRANSCRIPT_DIR = "/home/vovkes/.claude/projects/-home-vovkes-SecondLayer"
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "rotation_ablation.json")


def extract_component(path: str) -> str | None:
    """Map a file path to a high-level component."""
    if not path or not path.startswith("/home/vovkes/SecondLayer"):
        return None
    rel = path.replace("/home/vovkes/SecondLayer/", "")

    if rel.startswith("mcp_backend/src/services/"):
        svc = rel.split("/")[-1].replace(".ts", "").replace(".js", "")
        return f"backend/{svc}"
    if rel.startswith("mcp_backend/src/api/"):
        return "backend/api"
    if rel.startswith("mcp_backend/src/migrations/"):
        return "backend/migrations"
    if rel.startswith("mcp_backend/"):
        return "backend/other"
    if rel.startswith("mcp_rada/"):
        return "rada"
    if rel.startswith("mcp_openreyestr/"):
        return "openreyestr"
    if rel.startswith("lexwebapp/src/pages/"):
        page = rel.split("/")[3] if len(rel.split("/")) > 3 else "other"
        return f"frontend/{page}"
    if rel.startswith("lexwebapp/src/components/"):
        return "frontend/components"
    if rel.startswith("lexwebapp/src/services/"):
        return "frontend/services"
    if rel.startswith("lexwebapp/src/stores/"):
        return "frontend/stores"
    if rel.startswith("lexwebapp/"):
        return "frontend/other"
    if rel.startswith("deployment/"):
        return "deployment"
    if rel.startswith("packages/shared/"):
        return "shared"
    if rel.startswith("scripts/"):
        return "scripts"
    if rel.startswith("docs/"):
        return "docs"
    if rel.startswith(".github/"):
        return "ci"
    if rel == "CLAUDE.md":
        return "config"
    return "other"


def parse_session(filepath: str) -> dict | None:
    """Parse a JSONL transcript and extract session metadata."""
    reads = []
    edits = []
    first_prompt = None
    session_id = None

    try:
        with open(filepath) as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                t = obj.get("type", "")

                if t == "permission-mode" and not session_id:
                    session_id = obj.get("sessionId")

                if t == "user" and "message" in obj:
                    msg = obj["message"]
                    if msg.get("role") == "user" and isinstance(msg.get("content"), str):
                        text = msg["content"].strip()
                        if not first_prompt and not text.startswith("<"):
                            first_prompt = text[:200]

                if t == "assistant" and "message" in obj:
                    msg = obj["message"]
                    if isinstance(msg.get("content"), list):
                        for block in msg["content"]:
                            if not isinstance(block, dict):
                                continue
                            if block.get("type") != "tool_use":
                                continue
                            name = block.get("name", "")
                            inp = block.get("input", {})
                            if name == "Read":
                                p = inp.get("file_path", "")
                                if p and p.startswith("/home/vovkes/SecondLayer"):
                                    reads.append(p)
                            elif name in ("Edit", "Write"):
                                p = inp.get("file_path", "")
                                if p and p.startswith("/home/vovkes/SecondLayer"):
                                    edits.append(p)
    except Exception as e:
        return None

    if not edits:
        return None

    unique_reads = list(set(reads))
    unique_edits = list(set(edits))

    read_components = set(filter(None, [extract_component(p) for p in unique_reads]))
    edit_components = set(filter(None, [extract_component(p) for p in unique_edits]))

    read_also_edited = set(unique_reads) & set(unique_edits)
    wasted = set(unique_reads) - set(unique_edits)
    waste_ratio = len(wasted) / len(unique_reads) if unique_reads else 0.0

    ts = os.path.getmtime(filepath)

    return {
        "file": os.path.basename(filepath),
        "session_id": session_id,
        "timestamp": ts,
        "timestamp_iso": datetime.fromtimestamp(ts).isoformat(),
        "prompt": first_prompt,
        "n_unique_reads": len(unique_reads),
        "n_unique_edits": len(unique_edits),
        "n_wasted": len(wasted),
        "waste_ratio": round(waste_ratio, 4),
        "read_components": sorted(read_components),
        "edit_components": sorted(edit_components),
        "all_components": sorted(read_components | edit_components),
    }


def analyze_pairs(sessions: list[dict]) -> dict:
    """Analyze consecutive session pairs for rotation effects."""
    sessions_sorted = sorted(sessions, key=lambda s: s["timestamp"])

    pairs = []
    for i in range(len(sessions_sorted) - 1):
        a = sessions_sorted[i]
        b = sessions_sorted[i + 1]

        comp_a = set(a["edit_components"])
        comp_b = set(b["all_components"])
        overlap = comp_a & comp_b
        overlap_ratio = len(overlap) / len(comp_b) if comp_b else 0.0

        is_continuation = len(overlap) > 0

        pairs.append({
            "session_a": a["file"],
            "session_b": b["file"],
            "ts_a": a["timestamp_iso"],
            "ts_b": b["timestamp_iso"],
            "gap_hours": round((b["timestamp"] - a["timestamp"]) / 3600, 1),
            "comp_a_edit": sorted(comp_a),
            "comp_b_all": sorted(comp_b),
            "overlap": sorted(overlap),
            "overlap_ratio": round(overlap_ratio, 4),
            "is_continuation": is_continuation,
            "b_waste_ratio": b["waste_ratio"],
            "b_n_reads": b["n_unique_reads"],
            "b_n_edits": b["n_unique_edits"],
            "b_n_wasted": b["n_wasted"],
        })

    # Split by condition
    continuations = [p for p in pairs if p["is_continuation"]]
    switches = [p for p in pairs if not p["is_continuation"]]

    def stats(values):
        if not values:
            return {"n": 0}
        return {
            "n": len(values),
            "mean": round(statistics.mean(values), 4),
            "median": round(statistics.median(values), 4),
            "stdev": round(statistics.stdev(values), 4) if len(values) > 1 else 0,
            "p25": round(sorted(values)[len(values) // 4], 4),
            "p75": round(sorted(values)[3 * len(values) // 4], 4),
        }

    cont_waste = [p["b_waste_ratio"] for p in continuations]
    switch_waste = [p["b_waste_ratio"] for p in switches]
    cont_reads = [p["b_n_reads"] for p in continuations]
    switch_reads = [p["b_n_reads"] for p in switches]

    # Effect size (Cohen's d)
    if cont_waste and switch_waste and len(cont_waste) > 1 and len(switch_waste) > 1:
        pooled_std = (
            (statistics.stdev(cont_waste) ** 2 * (len(cont_waste) - 1)
             + statistics.stdev(switch_waste) ** 2 * (len(switch_waste) - 1))
            / (len(cont_waste) + len(switch_waste) - 2)
        ) ** 0.5
        cohens_d = (statistics.mean(switch_waste) - statistics.mean(cont_waste)) / pooled_std if pooled_std > 0 else 0
    else:
        cohens_d = None

    return {
        "total_pairs": len(pairs),
        "continuations": {
            "n": len(continuations),
            "waste_ratio": stats(cont_waste),
            "bootstrap_reads": stats(cont_reads),
        },
        "switches": {
            "n": len(switches),
            "waste_ratio": stats(switch_waste),
            "bootstrap_reads": stats(switch_reads),
        },
        "rotation_cost": {
            "waste_ratio_delta": round(
                statistics.mean(switch_waste) - statistics.mean(cont_waste), 4
            ) if cont_waste and switch_waste else None,
            "reads_delta": round(
                statistics.mean(switch_reads) - statistics.mean(cont_reads), 1
            ) if cont_reads and switch_reads else None,
            "cohens_d": round(cohens_d, 3) if cohens_d is not None else None,
        },
        "pairs": pairs,
    }


def main():
    files = sorted(glob.glob(os.path.join(TRANSCRIPT_DIR, "*.jsonl")))
    print(f"Found {len(files)} transcripts")

    sessions = []
    for f in files:
        s = parse_session(f)
        if s and s["n_unique_reads"] >= 2:
            sessions.append(s)

    print(f"Parsed {len(sessions)} sessions with ≥2 reads and ≥1 edit")

    # Component frequency
    comp_freq = defaultdict(int)
    for s in sessions:
        for c in s["all_components"]:
            comp_freq[c] += 1
    print("\nTop components:")
    for c, n in sorted(comp_freq.items(), key=lambda x: -x[1])[:15]:
        print(f"  {n:3d}  {c}")

    results = analyze_pairs(sessions)
    print(f"\nTotal consecutive pairs: {results['total_pairs']}")
    print(f"  Continuations (overlapping): {results['continuations']['n']}")
    print(f"  Switches (disjoint):         {results['switches']['n']}")
    print(f"\nWaste ratio:")
    print(f"  Continuation: {results['continuations']['waste_ratio']}")
    print(f"  Switch:       {results['switches']['waste_ratio']}")
    print(f"\nRotation cost:")
    print(f"  Waste delta:  {results['rotation_cost']['waste_ratio_delta']}")
    print(f"  Reads delta:  {results['rotation_cost']['reads_delta']}")
    print(f"  Cohen's d:    {results['rotation_cost']['cohens_d']}")

    # Gap analysis: continuation vs switch by time gap
    short_gap = [p for p in results["pairs"] if p["gap_hours"] < 4]
    long_gap = [p for p in results["pairs"] if p["gap_hours"] >= 24]
    print(f"\nBy time gap:")
    print(f"  Short (<4h):  {len(short_gap)} pairs, "
          f"cont={sum(1 for p in short_gap if p['is_continuation'])}, "
          f"switch={sum(1 for p in short_gap if not p['is_continuation'])}")
    print(f"  Long (≥24h):  {len(long_gap)} pairs, "
          f"cont={sum(1 for p in long_gap if p['is_continuation'])}, "
          f"switch={sum(1 for p in long_gap if not p['is_continuation'])}")

    # Long gap + switch = worst case (simulated rotation after dormancy)
    long_switch = [p for p in long_gap if not p["is_continuation"]]
    long_cont = [p for p in long_gap if p["is_continuation"]]
    if long_switch and long_cont:
        print(f"\n  Long-gap continuation waste: "
              f"{statistics.mean([p['b_waste_ratio'] for p in long_cont]):.3f}")
        print(f"  Long-gap switch waste:       "
              f"{statistics.mean([p['b_waste_ratio'] for p in long_switch]):.3f}")

    output = {
        "experiment": "rotation_ablation",
        "description": "Operator rotation ablation: context waste comparison between "
                       "continuation sessions (overlapping components) and switch sessions "
                       "(disjoint components, simulating operator rotation)",
        "n_sessions": len(sessions),
        "n_pairs": results["total_pairs"],
        "continuations": results["continuations"],
        "switches": results["switches"],
        "rotation_cost": results["rotation_cost"],
        "by_gap": {
            "short_gap_hours": 4,
            "long_gap_hours": 24,
            "short_gap_pairs": len(short_gap),
            "long_gap_pairs": len(long_gap),
            "long_gap_continuation_waste": round(
                statistics.mean([p["b_waste_ratio"] for p in long_cont]), 4
            ) if long_cont else None,
            "long_gap_switch_waste": round(
                statistics.mean([p["b_waste_ratio"] for p in long_switch]), 4
            ) if long_switch else None,
        },
        "sessions": [
            {k: v for k, v in s.items() if k != "prompt"}
            for s in sorted(sessions, key=lambda x: x["timestamp"])
        ],
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nResults written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
