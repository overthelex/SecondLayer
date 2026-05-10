"""
DPO training script for SageMaker.
Runs inside HuggingFace DLC container on ml.g5.12xlarge (4x A10G).

Trains Llama 3.1 8B Instruct with QLoRA + DPO on preference pairs.
SageMaker passes hyperparameters via SM_HP_* env vars, data via /opt/ml/input/data/.
"""

import os
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, TaskType
from trl import DPOConfig, DPOTrainer


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
    lr = get_hp("learning_rate", "5e-5", float)
    beta = get_hp("beta", "0.1", float)
    max_length = get_hp("max_length", "1024", int)
    max_prompt_length = get_hp("max_prompt_length", "512", int)

    lora_r = get_hp("lora_r", "16", int)
    lora_alpha = get_hp("lora_alpha", "32", int)
    lora_dropout = get_hp("lora_dropout", "0.05", float)

    print(f"=== DPO Training: Condition {condition}, Seed {seed} ===")
    print(f"Model: {model_name}")
    print(f"Data: {dataset_path}")
    print(f"Hyperparams: lr={lr}, beta={beta}, epochs={num_epochs}, batch={batch_size}x{grad_accum}")

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        attn_implementation="flash_attention_2",
        torch_dtype=torch.bfloat16,
    )

    peft_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        target_modules="all-linear",
        task_type=TaskType.CAUSAL_LM,
        bias="none",
    )

    train_path = os.path.join(dataset_path, "train.jsonl")
    val_path = os.path.join(dataset_path, "val.jsonl")

    train_dataset = load_dataset("json", data_files=train_path, split="train")
    eval_dataset = None
    if os.path.exists(val_path):
        eval_dataset = load_dataset("json", data_files=val_path, split="train")

    print(f"Train: {len(train_dataset)} pairs, Val: {len(eval_dataset) if eval_dataset else 0}")

    training_args = DPOConfig(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=grad_accum,
        learning_rate=lr,
        beta=beta,
        max_length=max_length,
        max_prompt_length=max_prompt_length,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch" if eval_dataset else "no",
        optim="adamw_torch_fused",
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        remove_unused_columns=False,
        disable_dropout=True,
        loss_type="sigmoid",
        ddp_find_unused_parameters=False,
        dataloader_num_workers=4,
        seed=seed,
        run_name=f"dpo-{condition}-seed{seed}",
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

    trainer.train()
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)

    metrics = trainer.state.log_history
    import json
    with open(os.path.join(output_dir, "training_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"Done. Condition {condition}, seed {seed}. Adapter saved to {output_dir}")


if __name__ == "__main__":
    main()
