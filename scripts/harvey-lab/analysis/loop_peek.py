import json, sys
from pathlib import Path
RESULTS, MODEL = Path("results"), "eu-anthropic-claude-sonnet-4-6"
task = sys.argv[1]
run = sorted((RESULTS / task / MODEL).iterdir())[-1]
rows = [json.loads(l) for l in (run / "transcript.jsonl").open(encoding="utf-8")]
cmds = []
for r in rows:
    for tc in (r.get("tool_calls") or []):
        if tc.get("name") != "bash":
            continue
        try:
            a = json.loads(tc.get("arguments") or "{}")
        except Exception:
            a = {}
        cmds.append((a.get("command") or a.get("cmd") or "?").strip().replace("\n", " ")[:150])
print(f"{task}: {len(cmds)} bash calls")
for i, c in enumerate(cmds[:4], 1):
    print(f"  [{i}] {c}")
print("  ...")
for i, c in enumerate(cmds[-3:], len(cmds) - 2):
    print(f"  [{i}] {c}")
uniq = len(set(cmds))
print(f"  distinct commands: {uniq} of {len(cmds)}")
