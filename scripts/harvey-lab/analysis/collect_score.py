#!/usr/bin/env python3
"""Append one row of a judged run to a TSV: task, passed, total, all_pass."""

import json
import sys
from pathlib import Path

rid, task, out = sys.argv[1], sys.argv[2], sys.argv[3]
p = Path("results") / rid / "scores.json"
with Path(out).open("a", encoding="utf-8") as fh:
    if not p.exists():
        fh.write(f"{task}\tNO_SCORES\t\t\n")
        raise SystemExit
    d = json.loads(p.read_text(encoding="utf-8"))
    fh.write(f"{task}\t{d['n_passed']}\t{d['n_criteria']}\t"
             f"{1 if d['all_pass'] else 0}\n")
