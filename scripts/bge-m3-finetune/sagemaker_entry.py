#!/usr/bin/env python3
"""SageMaker entry point for BGE-M3 fine-tuning.

Runs inside the SageMaker training container. Reads hyperparameters from
SM_HP_* env vars, installs FlagEmbedding, and launches training.
Logs params/metrics/artifacts to MLflow.
"""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path


def install_deps():
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "-q",
        "transformers>=4.42,<4.44",
        "FlagEmbedding==1.2.11",
        "peft",
        "sentencepiece",
        "datasets",
        "mlflow>=2.10",
    ])


def setup_mlflow(stage: int, hp: dict, train_data: str, n_gpus: int):
    """Start MLflow run and log hyperparameters."""
    try:
        import mlflow

        tracking_uri = os.environ.get("MLFLOW_TRACKING_URI", "http://35.84.222.41:5000")
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment("bge-m3-finetune")

        job_name = os.environ.get("SM_TRAINING_JOB_NAME", "local")
        instance_type = "unknown"
        rc = os.environ.get("SM_RESOURCE_CONFIG", "")
        if rc:
            try:
                instance_type = json.loads(rc).get("current_instance_type", "unknown")
            except Exception:
                pass

        run = mlflow.start_run(
            run_name=f"stage{stage}-{job_name}",
            tags={
                "project": "secondlayer",
                "task": "bge-m3-finetune",
                "stage": str(stage),
                "launched_from": job_name,
                "hardware": f"{n_gpus}xA10G",
            },
        )

        train_size = 0
        try:
            with open(train_data) as f:
                for _ in f:
                    train_size += 1
        except Exception:
            pass

        mlflow.log_params({
            "stage": stage,
            "base_model": hp.get("resume_from", "BAAI/bge-m3") if hp.get("resume_from") else "BAAI/bge-m3",
            "learning_rate": hp.get("learning_rate", "1e-5"),
            "num_train_epochs": hp.get("num_train_epochs", "3"),
            "per_device_train_batch_size": hp.get("per_device_train_batch_size", "2"),
            "warmup_ratio": hp.get("warmup_ratio", "0.05"),
            "query_max_len": hp.get("query_max_len", "512"),
            "passage_max_len": hp.get("passage_max_len", "2048"),
            "unified_finetuning": hp.get("unified_finetuning", "False"),
            "use_self_distill": hp.get("use_self_distill", "False"),
            "n_gpus": n_gpus,
            "instance_type": instance_type,
            "train_pairs": train_size,
        })

        print(f"[mlflow] Run started: {run.info.run_id}")
        print(f"[mlflow] Experiment: bge-m3-finetune")
        return True
    except Exception as e:
        print(f"[mlflow] Failed to start: {e}")
        return False


def parse_training_logs(log_line: str) -> dict:
    """Extract loss/lr/step from FlagEmbedding training output."""
    metrics = {}
    # Pattern: {'loss': 0.1234, 'grad_norm': ..., 'learning_rate': ..., 'epoch': ...}
    loss_match = re.search(r"'loss':\s*([\d.]+)", log_line)
    lr_match = re.search(r"'learning_rate':\s*([\d.e-]+)", log_line)
    epoch_match = re.search(r"'epoch':\s*([\d.]+)", log_line)
    step_match = re.search(r"(\d+)/\d+", log_line)

    if loss_match:
        metrics["loss"] = float(loss_match.group(1))
    if lr_match:
        metrics["learning_rate"] = float(lr_match.group(1))
    if epoch_match:
        metrics["epoch"] = float(epoch_match.group(1))

    step = None
    if step_match:
        step = int(step_match.group(1))

    return metrics, step


def stream_and_log(cmd: list[str]) -> int:
    """Run training command, stream stdout, and log metrics to MLflow."""
    mlflow_ok = False
    try:
        import mlflow
        mlflow_ok = mlflow.active_run() is not None
    except ImportError:
        pass

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    for line in process.stdout:
        print(line, end="", flush=True)

        if mlflow_ok and ("loss" in line or "'loss'" in line):
            metrics, step = parse_training_logs(line)
            if metrics:
                try:
                    mlflow.log_metrics(metrics, step=step)
                except Exception:
                    pass

    process.wait()
    return process.returncode


def embedding_spread_check(model_dir, train_dir, n=64):
    """Pairwise-cosine std of CLS embeddings over a training sample.

    A healthy encoder gives std ~0.1; a collapsed one gives ~0.
    """
    import glob
    import json as _json
    import numpy as np
    import torch
    from transformers import AutoModel, AutoTokenizer

    texts = []
    for f in glob.glob(os.path.join(train_dir, "*.jsonl")):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                d = _json.loads(line)
                texts.append(d.get("query") or d.get("pos", [""])[0])
                if len(texts) >= n:
                    break
        if len(texts) >= n:
            break

    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModel.from_pretrained(model_dir).eval()
    if torch.cuda.is_available():
        model = model.cuda()
    embs = []
    with torch.no_grad():
        for i in range(0, len(texts), 16):
            enc = tok(texts[i:i + 16], max_length=256, truncation=True,
                      padding=True, return_tensors="pt")
            if torch.cuda.is_available():
                enc = {k: v.cuda() for k, v in enc.items()}
            h = model(**enc).last_hidden_state[:, 0]
            embs.append(torch.nn.functional.normalize(h, dim=-1).float().cpu())
    v = torch.cat(embs).numpy()
    sims = v @ v.T
    return float(sims[np.triu_indices(len(v), k=1)].std())


def main():
    install_deps()

    # SageMaker paths
    train_dir = os.environ.get("SM_CHANNEL_TRAINING", "/opt/ml/input/data/training")
    model_dir = os.environ.get("SM_MODEL_DIR", "/opt/ml/model")
    n_gpus = int(os.environ.get("SM_NUM_GPUS", "1"))

    # Read hyperparameters
    hp = {}
    hp_file = "/opt/ml/input/config/hyperparameters.json"
    if os.path.exists(hp_file):
        with open(hp_file) as f:
            hp = json.load(f)
    else:
        for k, v in os.environ.items():
            if k.startswith("SM_HP_"):
                hp[k[6:].lower()] = v

    stage = int(hp.get("stage", "2"))
    resume_from = hp.get("resume_from", "")
    base_model = resume_from if resume_from else "BAAI/bge-m3"

    # Stage-1 checkpoint arrives via the 'model' channel as model.tar.gz -
    # extract it and use the local dir (from_pretrained can't read s3:// URIs)
    model_channel = os.environ.get("SM_CHANNEL_MODEL")
    if model_channel:
        import tarfile
        tars = [f for f in os.listdir(model_channel) if f.endswith(".tar.gz")]
        if tars:
            dest = "/tmp/stage1_model"
            os.makedirs(dest, exist_ok=True)
            with tarfile.open(os.path.join(model_channel, tars[0])) as t:
                t.extractall(dest)
            if not os.path.exists(os.path.join(dest, "config.json")):
                subs = [d for d in os.listdir(dest)
                        if os.path.exists(os.path.join(dest, d, "config.json"))]
                if subs:
                    dest = os.path.join(dest, subs[0])
            base_model = dest
        else:
            base_model = model_channel
        print(f"Using checkpoint from model channel: {base_model}")

    # FlagEmbedding 1.2.11 expects --train_data to be a directory containing JSONL files
    train_data = train_dir

    print(f"Stage: {stage}")
    print(f"Base model: {base_model}")
    print(f"Train data: {train_data}")
    print(f"GPUs: {n_gpus}")

    # MLflow
    t0 = time.time()
    mlflow_ok = setup_mlflow(stage, hp, train_data, n_gpus)

    # Build FlagEmbedding command
    # Use train_wrapper.py which inits gloo dist before importing FlagEmbedding.
    # This satisfies dist.get_rank() without DDP wrapper, so gradient checkpointing works.
    wrapper_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "train_wrapper.py")

    cmd = [
        sys.executable, wrapper_path,
        "--model_name_or_path", base_model,
        "--train_data", train_data,
        "--output_dir", model_dir,
        "--overwrite_output_dir",
        "--learning_rate", hp.get("learning_rate", "1e-5"),
        "--num_train_epochs", hp.get("num_train_epochs", "3"),
        "--per_device_train_batch_size", hp.get("per_device_train_batch_size", "2"),
        "--warmup_ratio", hp.get("warmup_ratio", "0.05"),
        "--query_max_len", hp.get("query_max_len", "512"),
        "--passage_max_len", hp.get("passage_max_len", "2048"),
        "--temperature", "0.02",
        "--logging_steps", "50",
        "--save_steps", "1000",
        "--save_total_limit", "2",
        # bf16, not fp16: XLM-R + temperature 0.02 + fp16 collapsed the encoder
        # to a constant vector (stage1 loss flat at ln(16), stage2 at ln(8))
        "--bf16" if hp.get("precision", "bf16") == "bf16" else "--fp16",
        "--dataloader_drop_last", "True",
        "--gradient_checkpointing",
        "--same_task_within_batch", "True",
        "--do_train",
    ]

    if hp.get("unified_finetuning", "False").lower() == "true":
        cmd.extend([
            "--unified_finetuning", "True",
            "--use_self_distill", "True",
            "--self_distill_start_step", hp.get("self_distill_start_step", "500"),
        ])

    print(f"\nCommand: {' '.join(cmd)}")

    returncode = stream_and_log(cmd)

    elapsed = time.time() - t0

    # Collapse guard: a degenerate encoder maps everything to one point and the
    # job still "succeeds". Embed a sample and fail loudly if vectors are constant.
    emb_std = None
    if returncode == 0:
        try:
            emb_std = embedding_spread_check(model_dir, train_data)
            print(f"[sanity] pairwise-cosine std over sample: {emb_std:.4f}")
        except Exception as e:
            print(f"[sanity] spread check failed to run: {e}")
        if emb_std is not None and emb_std < 0.01:
            print("[sanity] EMBEDDING COLLAPSE DETECTED - failing the job")
            returncode = 42

    if mlflow_ok:
        try:
            import mlflow
            mlflow.log_metrics({"training_time_s": elapsed,
                                **({"embedding_cos_std": emb_std} if emb_std is not None else {})})
            # Log model config as artifact
            config_path = os.path.join(model_dir, "config.json")
            if os.path.exists(config_path):
                mlflow.log_artifact(config_path)
            mlflow.end_run(status="FINISHED" if returncode == 0 else "FAILED")
            print(f"[mlflow] Run ended: {'FINISHED' if returncode == 0 else 'FAILED'}")
        except Exception as e:
            print(f"[mlflow] End run failed: {e}")

    if returncode != 0:
        sys.exit(returncode)

    print(f"\nTraining complete in {elapsed:.0f}s. Model saved to {model_dir}")


if __name__ == "__main__":
    main()
