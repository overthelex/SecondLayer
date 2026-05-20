#!/usr/bin/env python3
"""Generic entry point for continual learning jobs.
Reads model, direction, seed from SM_HP_* env vars."""
import subprocess, sys, os

model = os.environ.get("SM_HP_MODEL", "xlm-roberta-base")
direction = os.environ.get("SM_HP_DIRECTION", "forward")
seed = os.environ.get("SM_HP_SEED", "42")

print(f"=== Continual: {model} {direction} seed={seed} ===")
sys.exit(subprocess.run([
    sys.executable, "train_temporal.py",
    "--continual", direction,
    "--model", model,
    "--seed", seed,
]).returncode)
