#!/usr/bin/env python3
"""SFT of CPT-14B on citation-grounded ChatML data (LEXAI-1734, Track A).

Runs on Brev 8xH100. TRL SFTTrainer + LoRA + DeepSpeed ZeRO-3. Logs to the old
MLflow server (experiment cpt-qwen25-edrsr, alongside CPT/DPO history).

Data: scripts/sft-distill output `sft_chatml.jsonl` ({"messages":[sys,user,asst]}).
We convert each example to prompt/completion ({prompt:[sys,user], completion:[asst]})
so TRL masks the prompt via `completion_only_loss` — robust, no chat-template
generation tags required.

Launch via launch_sft_14b.sh (deepspeed --num_gpus=8).
"""
import argparse
import json
import os
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer
from peft import LoraConfig
from datasets import Dataset as HFDataset

try:
    import mlflow
    HAS_MLFLOW = True
except ImportError:
    HAS_MLFLOW = False

# Old MLflow server (reachable from Brev via WG since 2026-06-18). Auth via env.
MLFLOW_TRACKING_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://10.88.0.8:5000")
MLFLOW_EXPERIMENT = os.environ.get("MLFLOW_EXPERIMENT_NAME", "cpt-qwen25-edrsr")


def load_sft_data(data_path, eval_frac=0.02, seed=42):
    """Read ChatML JSONL -> prompt/completion records; hold out a small eval split."""
    recs = []
    with open(data_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            msgs = json.loads(line)["messages"]
            if len(msgs) < 2:
                continue
            recs.append({"prompt": msgs[:-1], "completion": [msgs[-1]]})
    # deterministic shuffle + split
    import random
    random.Random(seed).shuffle(recs)
    n_eval = max(1, int(len(recs) * eval_frac)) if eval_frac else 0
    eval_recs = recs[:n_eval]
    train_recs = recs[n_eval:]
    train_ds = HFDataset.from_list(train_recs)
    eval_ds = HFDataset.from_list(eval_recs) if eval_recs else None
    return train_ds, eval_ds


def main():
    p = argparse.ArgumentParser(description="SFT 14B (Track A)")
    p.add_argument("--model-path", required=True, help="CPT checkpoint (checkpoint-3000/.../final)")
    p.add_argument("--data-path", required=True, help="sft_chatml.jsonl")
    p.add_argument("--output-dir", default="/data/cpt-pipeline/12_sft_output_14b")
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--micro-batch-size", type=int, default=1)
    p.add_argument("--gradient-accumulation-steps", type=int, default=8)
    p.add_argument("--max-length", type=int, default=2048)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--max-steps", type=int, default=0, help=">0 caps steps (smoke test)")
    p.add_argument("--ds-config", default="/data/cpt-pipeline/scripts/configs/ds_zero3.json")
    p.add_argument("--local_rank", type=int, default=-1)
    args = p.parse_args()

    rank = int(os.environ.get("RANK", os.environ.get("LOCAL_RANK", 0)))
    os.makedirs(args.output_dir, exist_ok=True)

    train_ds, eval_ds = load_sft_data(args.data_path)
    run_name = f"sft-14b-{time.strftime('%m%d-%H%M')}"

    if rank == 0:
        print("=" * 60)
        print("SFT: CPT-14B -> citation-grounded instruct")
        print(f"Model: {args.model_path}")
        print(f"Data:  {args.data_path}  (train {len(train_ds)}, eval {len(eval_ds) if eval_ds else 0})")
        print(f"LoRA r={args.lora_r} a={args.lora_alpha} | lr={args.lr} epochs={args.epochs}")
        print(f"GPUs: {torch.cuda.device_count()}")
        print("=" * 60)
        if HAS_MLFLOW:
            mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
            mlflow.set_experiment(MLFLOW_EXPERIMENT)
            mlflow.start_run(run_name=run_name, tags={
                "task": "sft", "base": "cpt-qwen2.5-14b-checkpoint-3000",
                "data": os.path.basename(os.path.dirname(args.data_path)),
            })
            mlflow.log_params({
                "model_path": args.model_path, "lr": args.lr, "epochs": args.epochs,
                "lora_r": args.lora_r, "lora_alpha": args.lora_alpha,
                "max_length": args.max_length, "train_examples": len(train_ds),
                "micro_batch": args.micro_batch_size, "grad_accum": args.gradient_accumulation_steps,
            })

    # checkpoint tokenizer_config has extra_special_tokens as a list (old save);
    # transformers 4.57 expects a dict -> override with {} (tokens stay in vocab).
    tokenizer = AutoTokenizer.from_pretrained(
        args.model_path, trust_remote_code=True, extra_special_tokens={}
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        torch_dtype=torch.bfloat16,
        attn_implementation="sdpa",
        use_cache=False,
        trust_remote_code=True,
    )

    peft_config = LoraConfig(
        r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none", task_type="CAUSAL_LM",
    )

    sft_args = SFTConfig(
        output_dir=args.output_dir,
        run_name=run_name,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.micro_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        weight_decay=0.01,
        max_grad_norm=1.0,
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": True},
        logging_steps=5,
        save_steps=200,
        save_total_limit=3,
        eval_strategy="epoch" if (eval_ds is not None and not args.max_steps) else "no",
        max_steps=args.max_steps if args.max_steps else -1,
        max_length=args.max_length,
        completion_only_loss=True,   # mask the prompt, train only on assistant turn
        packing=False,
        deepspeed=args.ds_config,
        report_to=["mlflow"] if HAS_MLFLOW else ["none"],
        ddp_timeout=3600,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        processing_class=tokenizer,
        peft_config=peft_config,
    )

    if rank == 0:
        print("\nStarting SFT...")
    t0 = time.time()
    trainer.train()
    train_time = time.time() - t0

    trainer.save_model(os.path.join(args.output_dir, "final"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, "final"))

    if rank == 0:
        metrics = {"train_time_seconds": train_time, "total_steps": trainer.state.global_step}
        for entry in reversed(trainer.state.log_history):
            if "loss" in entry and "final_loss" not in metrics:
                metrics["final_loss"] = entry["loss"]
            if "eval_loss" in entry and "eval_loss" not in metrics:
                metrics["eval_loss"] = entry["eval_loss"]
        with open(os.path.join(args.output_dir, "sft_metrics.json"), "w") as f:
            json.dump(metrics, f, indent=2)
        if HAS_MLFLOW:
            mlflow.log_metrics({k: v for k, v in metrics.items() if isinstance(v, (int, float))})
            mlflow.log_artifact(os.path.join(args.output_dir, "sft_metrics.json"))
            mlflow.end_run()
        print(f"\nSFT complete in {train_time/3600:.2f}h -> {args.output_dir}/final")
        print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    if "LOCAL_RANK" not in os.environ:
        import subprocess
        import sys
        num_gpus = torch.cuda.device_count()
        print(f"Relaunching via deepspeed with {num_gpus} GPUs...")
        cmd = [sys.executable, "-m", "deepspeed.launcher.runner", "--num_gpus", str(num_gpus),
               "--no_local_rank", sys.argv[0]] + sys.argv[1:]
        sys.exit(subprocess.run(cmd).returncode)
    else:
        main()
