#!/usr/bin/env python3
"""Finish the remaining large-model jobs SINGLE-GPU (no DDP) at 8-way parallel.
560M fits easily on an 80GB H100, so DDP is pure overhead here. Skips any
(model,epoch,seed) whose cross_epoch_results.json already exists."""
import os, sys, time, subprocess
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

HERE = Path(__file__).parent
SCRIPT = HERE / "train_temporal.py"
RESULTS = HERE / "results" / "models"
MODELS = ["xlm-roberta-large", "legal-xlm-roberta-large"]
EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
SEEDS = [42, 123, 456]
N_GPUS = 8

def done(m, e, s):
    return (RESULTS / f"{m}_{e}_s{s}" / "cross_epoch_results.json").exists()

def run(slot, m, e, s):
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = str(slot % N_GPUS)
    env["MLFLOW_HARDWARE_TAG"] = "h100"
    env["TOKENIZERS_PARALLELISM"] = "false"
    cmd = [sys.executable, str(SCRIPT), "--model", m, "--epoch", e, "--seed", str(s)]
    t0 = time.time()
    print(f"START [GPU {slot%N_GPUS}] {m}/{e}/s{s}", flush=True)
    r = subprocess.run(cmd, env=env)
    dt = time.time() - t0
    st = "OK" if r.returncode == 0 else "FAIL"
    print(f"{st} [GPU {slot%N_GPUS}] {m}/{e}/s{s} ({dt:.0f}s)", flush=True)
    return (m, e, s, st, round(dt))

def main():
    jobs = [(m, e, s) for m in MODELS for e in EPOCHS for s in SEEDS if not done(m, e, s)]
    print(f"=== {len(jobs)} remaining large jobs, single-GPU, {N_GPUS} parallel ===", flush=True)
    # clean incomplete dirs so Trainer doesn't try to resume a stale checkpoint
    for m, e, s in jobs:
        d = RESULTS / f"{m}_{e}_s{s}"
        if d.exists():
            subprocess.run(["rm", "-rf", str(d)])
    results = []
    with ProcessPoolExecutor(max_workers=N_GPUS) as pool:
        futs = {pool.submit(run, i, *job): job for i, job in enumerate(jobs)}
        for f in as_completed(futs):
            results.append(f.result())
    ok = sum(1 for r in results if r[3] == "OK")
    print(f"\n=== FILL DONE: {ok} OK / {len(results)} ===", flush=True)
    for r in results:
        if r[3] == "FAIL":
            print("  FAIL", r)

if __name__ == "__main__":
    main()
