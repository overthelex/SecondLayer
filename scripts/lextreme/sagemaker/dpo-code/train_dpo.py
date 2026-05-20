"""
DPO training script for SageMaker.
DeepSpeed ZeRO-3 + LoRA on ml.g5.12xlarge (4x A10G).
LoRA means no separate ref_model needed — frozen base IS the reference.
"""

import os
import json
import time
import torch
from huggingface_hub import login
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from mlflow_logger import start_run, log_metrics, log_artifact, end_run

hf_token = os.environ.get("HUGGING_FACE_HUB_TOKEN", "")
if hf_token:
    os.environ["HF_TOKEN"] = hf_token
    os.environ["HUGGING_FACE_HUB_TOKEN"] = hf_token
    print(f"HF token set via env")

try:
    from trl import DPOConfig, DPOTrainer
except ImportError:
    from trl import DPOTrainer
    DPOConfig = None


def get_hp(name, default, cast=str):
    return cast(os.environ.get(f"SM_HP_{name.upper()}", default))


def main():
    model_name = get_hp("model_name_or_path", "meta-llama/Llama-3.1-8B-Instruct")
    dataset_path = get_hp("dataset_path", "/opt/ml/input/data/training")
    output_dir = get_hp("output_dir", "/opt/ml/model")
    condition = get_hp("condition", "a")
    seed = get_hp("seed", "42", int)

    num_epochs = get_hp("num_train_epochs", "1", int)
    batch_size = get_hp("per_device_train_batch_size", "2", int)
    grad_accum = get_hp("gradient_accumulation_steps", "4", int)
    lr = get_hp("learning_rate", "2e-4", float)
    beta = get_hp("beta", "0.1", float)
    max_length = get_hp("max_length", "1024", int)
    max_prompt_length = get_hp("max_prompt_length", "512", int)

    print(f"=== DPO Training (LoRA): Condition {condition}, Seed {seed} ===")
    print(f"Model: {model_name}")
    print(f"Data: {dataset_path}")
    print(f"GPUs: {torch.cuda.device_count()}")
    print(f"Hyperparams: lr={lr}, beta={beta}, epochs={num_epochs}, batch={batch_size}x{grad_accum}")

    start_run("dpo-edit-trace-oversight", {
        "model": model_name, "condition": condition, "seed": seed,
        "num_epochs": num_epochs, "batch_size": batch_size,
        "grad_accum": grad_accum, "lr": lr, "beta": beta,
        "max_length": max_length, "lora_r": 16, "lora_alpha": 32,
    }, tags={"experiment_type": "dpo", "condition": condition})

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.bfloat16,
    )

    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none",
        task_type="CAUSAL_LM",
    )

    train_path = os.path.join(dataset_path, "train.jsonl")
    val_path = os.path.join(dataset_path, "val.jsonl")

    train_dataset = load_dataset("json", data_files=train_path, split="train")
    eval_dataset = None
    if os.path.exists(val_path):
        eval_dataset = load_dataset("json", data_files=val_path, split="train")

    print(f"Train: {len(train_dataset)} pairs, Val: {len(eval_dataset) if eval_dataset else 0}")

    ds_config = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ds_zero3.json")
    if not os.path.exists(ds_config):
        ds_config = "ds_zero3.json"
    if not os.path.exists(ds_config):
        ds_config = None
        print("WARNING: ds_zero3.json not found")
    else:
        print(f"DeepSpeed config: {ds_config}")

    from transformers import TrainingArguments

    common_args = dict(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=grad_accum,
        learning_rate=lr,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=10,
        save_strategy="steps",
        save_steps=100,
        save_total_limit=2,
        optim="adamw_torch",
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        remove_unused_columns=False,
        dataloader_num_workers=4,
        seed=seed,
        run_name=f"dpo-{condition}-seed{seed}",
        deepspeed=ds_config,
    )

    if DPOConfig is not None:
        training_args = DPOConfig(
            **common_args,
            beta=beta,
            max_length=max_length,
            max_prompt_length=max_prompt_length,
            eval_strategy="epoch" if eval_dataset else "no",
        )
        trainer = DPOTrainer(
            model=model,
            ref_model=None,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            processing_class=tokenizer,
            peft_config=peft_config,
        )
    else:
        training_args = TrainingArguments(
            **common_args,
            evaluation_strategy="epoch" if eval_dataset else "no",
        )
        trainer = DPOTrainer(
            model=model,
            ref_model=None,
            args=training_args,
            beta=beta,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            tokenizer=tokenizer,
            max_length=max_length,
            max_prompt_length=max_prompt_length,
            peft_config=peft_config,
        )

    t0 = time.time()
    trainer.train()
    train_time = time.time() - t0

    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)

    metrics_path = os.path.join(output_dir, "training_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(trainer.state.log_history, f, indent=2)

    final_metrics = {}
    for entry in reversed(trainer.state.log_history):
        if "loss" in entry and "loss" not in final_metrics:
            final_metrics["final_loss"] = entry["loss"]
        if "eval_loss" in entry and "eval_loss" not in final_metrics:
            final_metrics["eval_loss"] = entry["eval_loss"]
        if "rewards/accuracies" in entry:
            final_metrics["final_accuracy"] = entry["rewards/accuracies"]
    final_metrics["train_time_seconds"] = train_time
    final_metrics["total_steps"] = trainer.state.global_step

    log_metrics(final_metrics)
    log_artifact(metrics_path)
    end_run()

    print(f"Done. Condition {condition}, seed {seed}. Time: {train_time:.0f}s")


if __name__ == "__main__":
    if "LOCAL_RANK" not in os.environ:
        import subprocess
        import sys
        num_gpus = torch.cuda.device_count()
        print(f"No distributed env detected. Relaunching via deepspeed with {num_gpus} GPUs...")
        cmd = [
            sys.executable, "-m", "deepspeed.launcher.runner",
            "--num_gpus", str(num_gpus),
            "--no_local_rank",
            sys.argv[0],
        ]
        result = subprocess.run(cmd)
        sys.exit(result.returncode)
    else:
        main()
