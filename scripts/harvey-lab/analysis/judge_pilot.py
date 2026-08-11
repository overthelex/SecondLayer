#!/usr/bin/env python3
"""Pick the pilot run per task and print the run-ids for the judge.

Scopes to the Sonnet 4.6 pilot only (not the earlier smoke runs) and takes the
newest run directory per task, so the two judge passes grade the same rollouts.

Usage:
    python judge_pilot.py            # list run ids
    python judge_pilot.py --check    # also report what is in each output/
"""

import json
import sys
from pathlib import Path

MODEL_DIR = "eu-anthropic-claude-sonnet-4-6"
RESULTS = Path("results")


def pilot_runs():
    by_task = {}
    for cfg in RESULTS.rglob("config.json"):
        if MODEL_DIR not in str(cfg):
            continue
        d = json.loads(cfg.read_text(encoding="utf-8"))
        task = d["task"]
        tj = Path("tasks") / task / "task.json"
        if not tj.exists():
            continue
        if json.loads(tj.read_text(encoding="utf-8")).get("jurisdiction") != "UA":
            continue
        # newest wins: run dir name is a timestamp
        prev = by_task.get(task)
        if prev is None or cfg.parent.name > prev.parent.name:
            by_task[task] = cfg
    return dict(sorted(by_task.items()))


def main():
    check = "--check" in sys.argv
    runs = pilot_runs()
    for task, cfg in runs.items():
        run_id = json.loads(cfg.read_text(encoding="utf-8"))["run_id"]
        if check:
            out = cfg.parent / "output"
            files = sorted(p.name for p in out.iterdir()) if out.is_dir() else []
            print(f"{task}\t{run_id}\t{files}")
        else:
            print(f"{task}\t{run_id}")
    if check:
        print(f"\n{len(runs)} pilot runs", file=sys.stderr)


if __name__ == "__main__":
    main()
