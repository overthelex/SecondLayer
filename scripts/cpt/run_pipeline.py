#!/usr/bin/env python3
"""
CPT Data Prep Pipeline Orchestrator.
Runs stages sequentially with checkpointing.

Usage:
  python3 scripts/cpt/run_pipeline.py --output-dir /home/vovkes/data/cpt-pipeline --target-model Qwen/Qwen2.5-72B --target-tokens 80B --workers 4 --cleanup
"""

import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

STAGES = {
    1: {"name": "export", "script": "01_export.py", "dir": "01_raw"},
    2: {"name": "clean", "script": "02_clean.py", "dir": "02_clean"},
    3: {"name": "dedup", "script": "03_dedup.py", "dir": "03_dedup"},
    4: {"name": "filter", "script": "04_filter.py", "dir": "04_filtered"},
    5: {"name": "structure", "script": "05_structure.py", "dir": "05_structured"},
    6: {"name": "tokenize", "script": "06_tokenize.py", "dir": "06_tokenized"},
    7: {"name": "package", "script": "07_package.py", "dir": "07_packaged"},
    8: {"name": "upload", "script": "08_upload.py", "dir": "07_packaged"},
}
SCRIPT_DIR = Path(__file__).parent


def is_complete(output_dir, n):
    return os.path.exists(os.path.join(output_dir, STAGES[n]["dir"], f"stage_{n}_complete.json"))

def mark_complete(output_dir, n, stats):
    path = os.path.join(output_dir, STAGES[n]["dir"], f"stage_{n}_complete.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f: json.dump({"stage": n, **stats}, f, indent=2)

def run_stage(n, output_dir, args):
    s = STAGES[n]
    sd = os.path.join(output_dir, s["dir"])
    print(f"\n{'='*60}\nStage {n}: {s['name']}\n{'='*60}")

    if n == 8 and not args.s3_prefix:
        print("  Skip upload (no --s3-prefix)"); return True

    cmd = [sys.executable, str(SCRIPT_DIR / s["script"])]
    if n == 1:
        cmd += ["--output-dir", sd, "--workers", str(args.workers), "--source", "all"]
        if args.db_port: cmd += ["--db-port", str(args.db_port)]
    elif n in (2,3,4,5):
        prev = os.path.join(output_dir, STAGES[n-1]["dir"])
        cmd += ["--input-dir", prev, "--output-dir", sd, "--workers", str(args.workers)]
    elif n == 6:
        cmd += ["--input-dir", os.path.join(output_dir, STAGES[5]["dir"]),
                "--output-dir", sd, "--model", args.target_model]
        if args.sample_only: cmd.append("--sample-only")
    elif n == 7:
        cmd += ["--input-dir", os.path.join(output_dir, STAGES[6]["dir"], "tokens"),
                "--output-dir", sd, "--max-seq-length", str(args.max_seq_length), "--seed", str(args.seed)]
        if args.target_tokens: cmd += ["--target-tokens", args.target_tokens]
    elif n == 8:
        cmd += ["--input-dir", sd, "--s3-prefix", args.s3_prefix]

    t0 = time.time()
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(SCRIPT_DIR.parent.parent))
    elapsed = time.time() - t0

    if result.returncode != 0:
        print(f"  Stage {n} FAILED"); return False

    mark_complete(output_dir, n, {"duration_sec": elapsed})

    if args.cleanup and 1 < n <= 7:
        prev = os.path.join(output_dir, STAGES[n-1]["dir"])
        if os.path.exists(prev) and n not in (6,7):
            sz = sum(os.path.getsize(os.path.join(r,f)) for r,d,fs in os.walk(prev) for f in fs) / (1024**3)
            print(f"  Cleanup: {prev} ({sz:.1f} GB)"); shutil.rmtree(prev)
    return True


def main():
    parser = argparse.ArgumentParser(description="CPT Pipeline")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--target-model", default="Qwen/Qwen2.5-72B")
    parser.add_argument("--target-tokens", default=None)
    parser.add_argument("--max-seq-length", type=int, default=8192)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--db-port", type=int, default=None)
    parser.add_argument("--s3-prefix", default=None)
    parser.add_argument("--stage", type=int, default=None)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--cleanup", action="store_true")
    parser.add_argument("--sample-only", action="store_true")
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    stages = [args.stage] if args.stage else list(range(1, 9))
    t0 = time.time()
    for n in stages:
        if args.resume and is_complete(args.output_dir, n):
            print(f"\nStage {n}: already complete, skipping"); continue
        if not run_stage(n, args.output_dir, args):
            print(f"\nStopped at stage {n}"); sys.exit(1)
    print(f"\n{'='*60}\nPipeline complete in {(time.time()-t0)/3600:.1f} hours\n{'='*60}")

if __name__ == "__main__":
    main()
