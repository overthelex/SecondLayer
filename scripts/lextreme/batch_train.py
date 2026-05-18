#!/usr/bin/env python3
"""
Batch launcher: run up to 4 experiments in parallel, 1 per GPU.
Designed for ml.g5.12xlarge (4x A10G, 24GB each).

Base models (278M) fit on 1 GPU with batch_size=16, max_seq_len=512.
Large models (560M) fit on 1 GPU with batch_size=8.

Usage:
  # All 36 training runs (base models: 4 parallel, large: 2 parallel)
  python batch_train.py

  # Only one model, all epochs×seeds
  python batch_train.py --model xlm-roberta-base

  # Only base models
  python batch_train.py --base-only

  # Continual learning
  python batch_train.py --continual
"""

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

SCRIPT = Path(__file__).parent / "train_temporal.py"
SM_MODEL_DIR = Path(os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))

MODELS = ["xlm-roberta-base", "xlm-roberta-large",
          "legal-xlm-roberta-base", "legal-xlm-roberta-large"]
EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
SEEDS = [42, 123, 456]

BASE_MODELS = [m for m in MODELS if "large" not in m]
LARGE_MODELS = [m for m in MODELS if "large" in m]


def run_experiment(gpu_id, model, epoch, seed, extra_args=None):
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = str(gpu_id)

    cmd = [
        sys.executable, str(SCRIPT),
        "--model", model,
        "--epoch", epoch,
        "--seed", str(seed),
    ]
    if extra_args:
        cmd.extend(extra_args)

    label = f"[GPU {gpu_id}] {model} / {epoch} / s{seed}"
    print(f"START: {label}", flush=True)
    t0 = time.time()

    result = subprocess.run(cmd, env=env, capture_output=True, text=True)

    elapsed = time.time() - t0
    status = "OK" if result.returncode == 0 else "FAIL"
    print(f"{status}: {label} ({elapsed:.0f}s)", flush=True)

    if result.returncode != 0:
        err_lines = result.stderr.strip().split("\n")[-5:]
        print(f"  ERROR: {' | '.join(err_lines)}", flush=True)

    return {
        "model": model, "epoch": epoch, "seed": seed,
        "gpu": gpu_id, "status": status, "elapsed": round(elapsed),
        "returncode": result.returncode,
    }


def run_continual(gpu_id, model, direction, seed):
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = str(gpu_id)

    cmd = [
        sys.executable, str(SCRIPT),
        "--model", model,
        "--continual", direction,
        "--seed", str(seed),
    ]

    label = f"[GPU {gpu_id}] continual {direction} / {model} / s{seed}"
    print(f"START: {label}", flush=True)
    t0 = time.time()

    result = subprocess.run(cmd, env=env, capture_output=True, text=True)

    elapsed = time.time() - t0
    status = "OK" if result.returncode == 0 else "FAIL"
    print(f"{status}: {label} ({elapsed:.0f}s)", flush=True)

    if result.returncode != 0:
        err_lines = result.stderr.strip().split("\n")[-5:]
        print(f"  ERROR: {' | '.join(err_lines)}", flush=True)

    return {
        "model": model, "direction": direction, "seed": seed,
        "gpu": gpu_id, "status": status, "elapsed": round(elapsed),
    }


def build_job_queue(args):
    jobs = []

    models = MODELS
    if args.model:
        models = [args.model]
    elif args.base_only:
        models = BASE_MODELS

    if args.continual:
        for model in models:
            for seed in SEEDS:
                for direction in ["forward", "backward"]:
                    jobs.append(("continual", model, direction, seed))
    else:
        for model in models:
            for epoch in EPOCHS:
                for seed in SEEDS:
                    jobs.append(("train", model, epoch, seed))

    return jobs


def max_parallel_for(model):
    if "large" in model:
        return 2  # 560M on 24GB GPU, leave headroom
    return 4  # 278M easily fits


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=MODELS)
    parser.add_argument("--base-only", action="store_true")
    parser.add_argument("--continual", action="store_true")
    parser.add_argument("--embeddings", action="store_true")
    args = parser.parse_args()

    n_gpus = 4
    try:
        import torch
        n_gpus = torch.cuda.device_count() or 1
    except ImportError:
        pass

    jobs = build_job_queue(args)
    print(f"=== {len(jobs)} experiments, {n_gpus} GPUs ===\n", flush=True)

    extra = ["--embeddings"] if args.embeddings else None

    # Group jobs by model size for optimal parallelism
    results = []
    # Process base models first (4 parallel), then large (2 parallel)
    base_jobs = [j for j in jobs if "large" not in j[1]]
    large_jobs = [j for j in jobs if "large" in j[1]]

    for group_name, group_jobs, parallelism in [
        ("base", base_jobs, min(n_gpus, 4)),
        ("large", large_jobs, min(n_gpus, 2)),
    ]:
        if not group_jobs:
            continue

        print(f"\n{'='*60}")
        print(f"  {group_name} models: {len(group_jobs)} jobs, {parallelism} parallel")
        print(f"{'='*60}\n", flush=True)

        with ProcessPoolExecutor(max_workers=parallelism) as pool:
            futures = {}
            gpu_cycle = 0

            for job in group_jobs:
                gpu_id = gpu_cycle % n_gpus
                gpu_cycle += 1

                if job[0] == "continual":
                    _, model, direction, seed = job
                    f = pool.submit(run_continual, gpu_id, model, direction, seed)
                else:
                    _, model, epoch, seed = job
                    f = pool.submit(run_experiment, gpu_id, model, epoch, seed, extra)

                futures[f] = job

            for f in as_completed(futures):
                results.append(f.result())

    # Summary
    ok = sum(1 for r in results if r["status"] == "OK")
    fail = sum(1 for r in results if r["status"] == "FAIL")
    total_time = sum(r["elapsed"] for r in results)

    print(f"\n{'='*60}")
    print(f"  DONE: {ok} OK, {fail} FAIL, {len(results)} total")
    print(f"  Wall time of individual jobs: {total_time}s ({total_time/3600:.1f}h)")
    print(f"{'='*60}\n", flush=True)

    # Save manifest
    manifest_path = SM_MODEL_DIR / "batch_manifest.json" if SM_MODEL_DIR.exists() else Path("scripts/lextreme/results/batch_manifest.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Manifest: {manifest_path}")

    if fail > 0:
        print("\nFailed jobs:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  {r}")
        sys.exit(1)


if __name__ == "__main__":
    main()
