#!/usr/bin/env python3
"""Why did a run produce no deliverable? Read the transcript, not the score.

If the failing runs spent their turns reading and never began writing, a bigger
turn budget plausibly helps. If they looped on the same call, or wrote and then
overwrote, more turns buys nothing and the 100-turn experiment is not worth
paying for.
"""

import json
import sys
from collections import Counter
from pathlib import Path

RESULTS = Path("results")
MODEL = "eu-anthropic-claude-sonnet-4-6"


def newest_run(task: str):
    cands = sorted((RESULTS / task / MODEL).iterdir()) if (RESULTS / task / MODEL).is_dir() else []
    return cands[-1] if cands else None


def analyse(task: str):
    run = newest_run(task)
    if not run:
        return None
    tr = run / "transcript.jsonl"
    if not tr.exists():
        return None
    rows = [json.loads(l) for l in tr.open(encoding="utf-8")]

    tools, writes, seq = Counter(), [], []
    for r in rows:
        for tc in (r.get("tool_calls") or []):
            name = tc.get("name")
            tools[name] += 1
            seq.append(name)
            if name in ("write", "edit"):
                args = tc.get("arguments") or "{}"
                try:
                    a = json.loads(args) if isinstance(args, str) else args
                except Exception:
                    a = {}
                path = a.get("file_path") or a.get("path") or "?"
                body = a.get("content") or a.get("new_string") or ""
                writes.append((Path(str(path)).name, len(str(body))))

    # longest run of one repeated tool, as a crude loop signal
    longest, cur = 0, 0
    for i, t in enumerate(seq):
        cur = cur + 1 if i and t == seq[i - 1] else 1
        longest = max(longest, cur)

    first_write = next((i for i, t in enumerate(seq) if t in ("write", "edit")), None)
    return {
        "turns": len(rows), "tools": dict(tools.most_common()),
        "n_writes": len(writes), "first_write_at_call": first_write,
        "total_calls": len(seq), "longest_same_tool_streak": longest,
        "writes": writes[:6],
    }


def main():
    for task in [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip()]:
        a = analyse(task)
        print("=" * 100)
        print(task)
        if not a:
            print("  (no transcript)")
            continue
        print(f"  turns={a['turns']} calls={a['total_calls']} tools={a['tools']}")
        print(f"  writes={a['n_writes']} first_write_at_call={a['first_write_at_call']} "
              f"longest_same_tool_streak={a['longest_same_tool_streak']}")
        for name, size in a["writes"]:
            print(f"     wrote {name}  ({size} chars)")


if __name__ == "__main__":
    main()
