#!/usr/bin/env python3
"""SageMaker entry point: run cross-jurisdiction experiments across 4 GPUs.

Distributes 12 jobs (4 experiments × 3 seeds) across available GPUs.
Each job uses 1 GPU; XLM-RoBERTa-base fits easily on a single A10G.

On ml.g5.12xlarge (4x A10G): 4 parallel → 3 rounds → ~1.5-2 hours.
"""
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "train_cross_jurisdiction.py")

EXPERIMENTS = ["zero_shot", "joint", "transfer", "reverse"]
SEEDS = [42, 123, 456]


def run_job(gpu_id, experiment, model, seed, binary_mode):
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = str(gpu_id)

    cmd = [
        sys.executable, SCRIPT,
        "--experiment", experiment,
        "--model", model,
        "--seed", str(seed),
        "--binary-mode", binary_mode,
    ]

    label = f"[GPU {gpu_id}] {experiment} / {model} / s{seed}"
    print(f"START: {label}", flush=True)
    t0 = time.time()

    result = subprocess.run(cmd, env=env, text=True, capture_output=True)

    elapsed = time.time() - t0
    status = "OK" if result.returncode == 0 else "FAIL"
    print(f"{status}: {label} ({elapsed:.0f}s)", flush=True)

    if result.returncode != 0:
        lines = (result.stderr or "").strip().split("\n")[-10:]
        print(f"  STDERR: {'|'.join(lines)}", flush=True)

    return {
        "experiment": experiment, "model": model, "seed": seed,
        "gpu": gpu_id, "status": status, "elapsed": round(elapsed),
    }


def main():
    import torch
    n_gpus = torch.cuda.device_count() or 1

    model = os.environ.get("SM_HP_MODEL", "xlm-roberta-base")
    binary_mode = os.environ.get("SM_HP_BINARY_MODE", "drop")
    experiments_str = os.environ.get("SM_HP_EXPERIMENTS", ",".join(EXPERIMENTS))
    seeds_str = os.environ.get("SM_HP_SEEDS", ",".join(str(s) for s in SEEDS))

    experiments = experiments_str.split(",")
    seeds = [int(s) for s in seeds_str.split(",")]

    jobs = [(exp, seed) for exp in experiments for seed in seeds]

    print(f"=== Cross-jurisdiction: {len(jobs)} jobs, {n_gpus} GPUs, model={model} ===", flush=True)
    print(f"    Experiments: {experiments}", flush=True)
    print(f"    Seeds: {seeds}", flush=True)
    print(f"    Binary mode: {binary_mode}", flush=True)

    # Pre-download SJP data BEFORE launching parallel workers (avoids race condition)
    print("\n--- Pre-downloading SJP data (single-threaded) ---", flush=True)
    from train_cross_jurisdiction import _download_sjp_split
    for split in ["train", "validation", "test"]:
        _download_sjp_split(split)
    print("--- SJP data cached, launching parallel jobs ---\n", flush=True)

    results = []
    with ProcessPoolExecutor(max_workers=n_gpus) as pool:
        futures = {}
        for i, (exp, seed) in enumerate(jobs):
            gpu_id = i % n_gpus
            f = pool.submit(run_job, gpu_id, exp, model, seed, binary_mode)
            futures[f] = (exp, seed)

        for f in as_completed(futures):
            results.append(f.result())

    ok = sum(1 for r in results if r["status"] == "OK")
    fail = sum(1 for r in results if r["status"] == "FAIL")
    total_time = sum(r["elapsed"] for r in results)

    print(f"\n{'='*60}", flush=True)
    print(f"  DONE: {ok} OK, {fail} FAIL, {len(results)} total", flush=True)
    print(f"  Sum of job times: {total_time}s ({total_time/3600:.1f}h)", flush=True)
    print(f"{'='*60}", flush=True)

    if fail > 0:
        print("\nFailed jobs:", flush=True)
        for r in results:
            if r["status"] == "FAIL":
                print(f"  {r}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
