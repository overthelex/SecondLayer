#!/usr/bin/env python3
"""
Temporal drift experiment: fine-tune encoder models on each epoch, evaluate cross-epoch.

SageMaker-compatible (ml.g5.12xlarge, 4x A10G) or local execution.
Runs ONE (model, epoch, seed) triple per invocation for atomic SageMaker jobs.

Usage:
  # Single run
  python train_temporal.py --model xlm-roberta-base --epoch pre_war --seed 42

  # All runs (local)
  python train_temporal.py --all

  # Cross-epoch evaluation only (after training)
  python train_temporal.py --eval-only --model xlm-roberta-base --epoch pre_war --seed 42

  # Continual learning (Exp 3)
  python train_temporal.py --continual forward --model xlm-roberta-base --seed 42
"""

import argparse
import json
import os
import time
from collections import defaultdict
from pathlib import Path

os.environ["HF_HOME"] = "/tmp/hf_cache"
os.environ["TRANSFORMERS_CACHE"] = "/tmp/hf_cache/transformers"
os.environ["HF_DATASETS_CACHE"] = "/tmp/hf_cache/datasets"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import numpy as np
import torch


def is_main_process():
    return int(os.environ.get("LOCAL_RANK", 0)) == 0
from datasets import Dataset
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

SM_MODEL_DIR = Path(os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))
SM_DATA_DIR = os.environ.get("SM_CHANNEL_DATA", "")

if SM_DATA_DIR:
    DATA_DIR = Path(SM_DATA_DIR)
    RESULTS_DIR = SM_MODEL_DIR / "results"
else:
    DATA_DIR = Path(__file__).parent / "output"
    RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
LABELS = ["approved", "dismissed", "partial"]
LABEL2ID = {l: i for i, l in enumerate(LABELS)}
ID2LABEL = {i: l for i, l in enumerate(LABELS)}
SEEDS = [42, 123, 456]

MODELS = {
    "xlm-roberta-base": "xlm-roberta-base",
    "xlm-roberta-large": "xlm-roberta-large",
    "legal-xlm-roberta-base": "joelniklaus/legal-xlm-roberta-base",
    "legal-xlm-roberta-large": "joelniklaus/legal-xlm-roberta-large",
}

TRAINING_DEFAULTS = {
    "base": {
        "learning_rate": 2e-5,
        "per_device_train_batch_size": 16,
        "per_device_eval_batch_size": 32,
        "gradient_accumulation_steps": 1,
    },
    "large": {
        "learning_rate": 1e-5,
        "per_device_train_batch_size": 8,
        "per_device_eval_batch_size": 16,
        "gradient_accumulation_steps": 2,
    },
}


def get_training_config(model_key):
    if "large" in model_key:
        return TRAINING_DEFAULTS["large"]
    return TRAINING_DEFAULTS["base"]


def load_split(epoch, split):
    path = DATA_DIR / epoch / f"{split}.jsonl"
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            records.append({"text": r["text"], "label": LABEL2ID[r["label"]]})
    return Dataset.from_list(records)


def tokenize_dataset(dataset, tokenizer, max_length=512):
    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=max_length,
            padding="max_length",
        )

    return dataset.map(tokenize_fn, batched=True, remove_columns=["text"])


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    macro_f1 = f1_score(labels, preds, average="macro")
    per_class_f1 = f1_score(labels, preds, average=None)
    acc = accuracy_score(labels, preds)
    return {
        "accuracy": acc,
        "macro_f1": macro_f1,
        "f1_approved": per_class_f1[0],
        "f1_dismissed": per_class_f1[1],
        "f1_partial": per_class_f1[2],
    }


def run_name(model_key, epoch, seed):
    return f"{model_key}_{epoch}_s{seed}"


def output_dir_for(model_key, epoch, seed):
    return RESULTS_DIR / "models" / run_name(model_key, epoch, seed)


def train_single(model_key, epoch, seed, max_train_samples=None):
    hf_id = MODELS[model_key]
    cfg = get_training_config(model_key)
    name = run_name(model_key, epoch, seed)
    out_dir = output_dir_for(model_key, epoch, seed)

    if (out_dir / "eval_results.json").exists():
        print(f"SKIP {name}: already trained (eval_results.json exists)")
        return json.loads((out_dir / "eval_results.json").read_text())

    print(f"\n{'='*60}")
    print(f"Training: {name}")
    print(f"  Model: {hf_id}")
    print(f"  Epoch: {epoch}")
    print(f"  Seed: {seed}")
    print(f"{'='*60}\n")

    tokenizer = AutoTokenizer.from_pretrained(hf_id)
    model = AutoModelForSequenceClassification.from_pretrained(
        hf_id,
        num_labels=len(LABELS),
        label2id=LABEL2ID,
        id2label=ID2LABEL,
        torch_dtype=torch.float32,
    )

    train_ds = load_split(epoch, "train")
    val_ds = load_split(epoch, "validation")

    if max_train_samples and len(train_ds) > max_train_samples:
        train_ds = train_ds.shuffle(seed=seed).select(range(max_train_samples))

    train_ds = tokenize_dataset(train_ds, tokenizer)
    val_ds = tokenize_dataset(val_ds, tokenizer)

    n_gpus = torch.cuda.device_count() or 1
    effective_batch = cfg["per_device_train_batch_size"] * n_gpus * cfg["gradient_accumulation_steps"]
    total_steps = (len(train_ds) // effective_batch) * 5
    warmup_steps = int(total_steps * 0.1)

    training_args = TrainingArguments(
        output_dir=str(out_dir),
        num_train_epochs=5,
        per_device_train_batch_size=cfg["per_device_train_batch_size"],
        per_device_eval_batch_size=cfg["per_device_eval_batch_size"],
        gradient_accumulation_steps=cfg["gradient_accumulation_steps"],
        learning_rate=cfg["learning_rate"],
        weight_decay=0.01,
        warmup_steps=warmup_steps,
        eval_strategy="steps",
        eval_steps=500,
        save_strategy="steps",
        save_steps=500,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        logging_steps=100,
        seed=seed,
        bf16=torch.cuda.is_available(),
        dataloader_num_workers=4,
        report_to="none",
        ddp_find_unused_parameters=False if n_gpus > 1 else None,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    t0 = time.time()
    trainer.train()
    train_time = time.time() - t0

    val_metrics = trainer.evaluate()

    if is_main_process():
        trainer.save_model(str(out_dir / "best_model"))
        tokenizer.save_pretrained(str(out_dir / "best_model"))

        results = {
            "model": model_key,
            "hf_id": hf_id,
            "train_epoch": epoch,
            "seed": seed,
            "train_samples": len(train_ds),
            "val_samples": len(val_ds),
            "train_time_seconds": round(train_time, 1),
            "n_gpus": n_gpus,
            **{k.replace("eval_", ""): v for k, v in val_metrics.items()},
        }

        with open(out_dir / "eval_results.json", "w") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        print(f"\n{name} done: macro_f1={results.get('macro_f1', 'N/A'):.4f}, "
              f"acc={results.get('accuracy', 'N/A'):.4f}, time={train_time:.0f}s")

        return results

    return None


def evaluate_cross_epoch(model_key, train_epoch, seed):
    if not is_main_process():
        return None

    out_dir = output_dir_for(model_key, train_epoch, seed)
    model_path = out_dir / "best_model"

    if not model_path.exists():
        print(f"SKIP cross-eval {run_name(model_key, train_epoch, seed)}: no best_model")
        return None

    tokenizer = AutoTokenizer.from_pretrained(str(model_path))
    model = AutoModelForSequenceClassification.from_pretrained(
        str(model_path),
        torch_dtype=torch.float32,
    )

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    cross_results = {}
    for test_epoch in EPOCHS:
        test_ds = load_split(test_epoch, "test")
        test_ds = tokenize_dataset(test_ds, tokenizer)

        trainer = Trainer(
            model=model,
            compute_metrics=compute_metrics,
            args=TrainingArguments(
                output_dir="/tmp/eval_tmp",
                per_device_eval_batch_size=32,
                report_to="none",
                use_cpu=not torch.cuda.is_available(),
            ),
        )

        metrics = trainer.evaluate(test_ds)

        all_preds = trainer.predict(test_ds)
        preds = np.argmax(all_preds.predictions, axis=-1)
        labels = all_preds.label_ids
        cm = confusion_matrix(labels, preds, labels=list(range(len(LABELS))))
        report = classification_report(labels, preds, target_names=LABELS, output_dict=True)

        cross_results[test_epoch] = {
            "accuracy": metrics["eval_accuracy"],
            "macro_f1": metrics["eval_macro_f1"],
            "f1_approved": metrics["eval_f1_approved"],
            "f1_dismissed": metrics["eval_f1_dismissed"],
            "f1_partial": metrics["eval_f1_partial"],
            "confusion_matrix": cm.tolist(),
            "classification_report": report,
            "n_samples": len(test_ds),
        }

        print(f"  {train_epoch} -> {test_epoch}: "
              f"macro_f1={metrics['eval_macro_f1']:.4f}, "
              f"acc={metrics['eval_accuracy']:.4f}")

    result_file = out_dir / "cross_epoch_results.json"
    full_result = {
        "model": model_key,
        "train_epoch": train_epoch,
        "seed": seed,
        "cross_eval": cross_results,
    }
    with open(result_file, "w") as f:
        json.dump(full_result, f, indent=2, ensure_ascii=False)

    return full_result


def extract_embeddings(model_key, train_epoch, seed, n_samples=1000):
    if not is_main_process():
        return

    out_dir = output_dir_for(model_key, train_epoch, seed)
    model_path = out_dir / "best_model"
    emb_file = out_dir / "embeddings.npz"

    if emb_file.exists():
        print(f"SKIP embeddings {run_name(model_key, train_epoch, seed)}: already exists")
        return

    if not model_path.exists():
        print(f"SKIP embeddings: no best_model at {model_path}")
        return

    tokenizer = AutoTokenizer.from_pretrained(str(model_path))
    model = AutoModelForSequenceClassification.from_pretrained(
        str(model_path),
        torch_dtype=torch.float32,
        output_hidden_states=True,
    )

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    all_embeddings = {}
    for epoch in EPOCHS:
        test_ds = load_split(epoch, "test")
        if len(test_ds) > n_samples:
            test_ds = test_ds.shuffle(seed=42).select(range(n_samples))
        test_ds = tokenize_dataset(test_ds, tokenizer)

        embeddings = []
        labels_list = []
        for i in range(0, len(test_ds), 32):
            batch = test_ds[i:i + 32]
            inputs = {
                k: torch.tensor(v).to(device)
                for k, v in batch.items()
                if k in ("input_ids", "attention_mask")
            }
            with torch.no_grad():
                outputs = model(**inputs)
            cls_emb = outputs.hidden_states[-1][:, 0, :].cpu().numpy()
            embeddings.append(cls_emb)
            labels_list.extend(batch["label"])

        all_embeddings[f"{epoch}_embeddings"] = np.concatenate(embeddings, axis=0)
        all_embeddings[f"{epoch}_labels"] = np.array(labels_list)

    np.savez_compressed(str(emb_file), **all_embeddings)
    print(f"  Saved embeddings to {emb_file}")


def run_continual(model_key, seed, direction="forward"):
    if direction == "forward":
        epoch_order = EPOCHS
    else:
        epoch_order = list(reversed(EPOCHS))

    name = f"continual_{direction}_{model_key}_s{seed}"
    out_dir = RESULTS_DIR / "continual" / name

    if (out_dir / "continual_results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "continual_results.json").read_text())

    out_dir.mkdir(parents=True, exist_ok=True)
    hf_id = MODELS[model_key]
    cfg = get_training_config(model_key)

    print(f"\n{'='*60}")
    print(f"Continual learning: {name}")
    print(f"  Order: {' -> '.join(epoch_order)}")
    print(f"{'='*60}\n")

    tokenizer = AutoTokenizer.from_pretrained(hf_id)
    model = AutoModelForSequenceClassification.from_pretrained(
        hf_id,
        num_labels=len(LABELS),
        label2id=LABEL2ID,
        id2label=ID2LABEL,
        torch_dtype=torch.float32,
    )

    results_per_stage = []

    for stage_idx, epoch in enumerate(epoch_order):
        print(f"\n--- Stage {stage_idx + 1}/3: {epoch} ---")

        train_ds = tokenize_dataset(load_split(epoch, "train"), tokenizer)
        val_ds = tokenize_dataset(load_split(epoch, "validation"), tokenizer)

        n_gpus = torch.cuda.device_count() or 1
        effective_batch = cfg["per_device_train_batch_size"] * n_gpus * cfg["gradient_accumulation_steps"]
        total_steps = (len(train_ds) // effective_batch) * 3
        warmup_steps = int(total_steps * 0.1)

        stage_dir = out_dir / f"stage_{stage_idx}_{epoch}"
        training_args = TrainingArguments(
            output_dir=str(stage_dir),
            num_train_epochs=3,
            per_device_train_batch_size=cfg["per_device_train_batch_size"],
            per_device_eval_batch_size=cfg["per_device_eval_batch_size"],
            gradient_accumulation_steps=cfg["gradient_accumulation_steps"],
            learning_rate=cfg["learning_rate"],
            weight_decay=0.01,
            warmup_steps=warmup_steps,
            eval_strategy="steps",
            eval_steps=500,
            save_strategy="steps",
            save_steps=500,
            save_total_limit=1,
            load_best_model_at_end=True,
            metric_for_best_model="macro_f1",
            greater_is_better=True,
            logging_steps=100,
            seed=seed,
            bf16=torch.cuda.is_available(),
            dataloader_num_workers=4,
            report_to="none",
        )

        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_ds,
            eval_dataset=val_ds,
            compute_metrics=compute_metrics,
            callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
        )

        trainer.train()
        model = trainer.model

        stage_eval = {}
        for test_epoch in EPOCHS:
            test_ds = tokenize_dataset(load_split(test_epoch, "test"), tokenizer)
            metrics = trainer.evaluate(test_ds)
            stage_eval[test_epoch] = {
                "accuracy": metrics["eval_accuracy"],
                "macro_f1": metrics["eval_macro_f1"],
            }
            print(f"    After {epoch}: test on {test_epoch} -> "
                  f"F1={metrics['eval_macro_f1']:.4f}")

        results_per_stage.append({
            "stage": stage_idx,
            "trained_on": epoch,
            "epochs_seen": epoch_order[:stage_idx + 1],
            "eval": stage_eval,
        })

    full_result = {
        "model": model_key,
        "direction": direction,
        "seed": seed,
        "epoch_order": epoch_order,
        "stages": results_per_stage,
    }
    with open(out_dir / "continual_results.json", "w") as f:
        json.dump(full_result, f, indent=2, ensure_ascii=False)

    return full_result


def aggregate_results():
    print("\n\n" + "=" * 80)
    print("AGGREGATE CROSS-EPOCH RESULTS")
    print("=" * 80)

    for model_key in MODELS:
        print(f"\n--- {model_key} ---")
        matrices = defaultdict(lambda: defaultdict(list))

        for seed in SEEDS:
            for train_epoch in EPOCHS:
                result_file = output_dir_for(model_key, train_epoch, seed) / "cross_epoch_results.json"
                if not result_file.exists():
                    continue
                data = json.loads(result_file.read_text())
                for test_epoch, metrics in data["cross_eval"].items():
                    matrices[train_epoch][test_epoch].append(metrics["macro_f1"])

        if not matrices:
            print("  No results yet")
            continue

        print(f"  {'Train/Test':<15} {'pre_war':>12} {'hybrid_war':>12} {'full_scale':>12}")
        print(f"  {'-'*51}")
        for train_epoch in EPOCHS:
            row = f"  {train_epoch:<15}"
            for test_epoch in EPOCHS:
                vals = matrices[train_epoch].get(test_epoch, [])
                if vals:
                    mean = np.mean(vals) * 100
                    std = np.std(vals) * 100
                    row += f" {mean:>8.1f}±{std:.1f}"
                else:
                    row += f" {'---':>12}"
            print(row)

        fwd_vals = matrices["pre_war"].get("full_scale", [])
        bwd_vals = matrices["full_scale"].get("pre_war", [])
        diag_pre = matrices["pre_war"].get("pre_war", [])
        diag_full = matrices["full_scale"].get("full_scale", [])

        if fwd_vals and diag_pre:
            fwd_drop = (np.mean(diag_pre) - np.mean(fwd_vals)) * 100
            print(f"\n  Forward degradation (pre_war diag - pre_war→full_scale): {fwd_drop:.1f} pp")
        if bwd_vals and diag_full:
            bwd_drop = (np.mean(diag_full) - np.mean(bwd_vals)) * 100
            print(f"  Backward degradation (full_scale diag - full_scale→pre_war): {bwd_drop:.1f} pp")

    agg_file = RESULTS_DIR / "aggregate_results.json"
    all_results = []
    for model_key in MODELS:
        for train_epoch in EPOCHS:
            for seed in SEEDS:
                rf = output_dir_for(model_key, train_epoch, seed) / "cross_epoch_results.json"
                if rf.exists():
                    all_results.append(json.loads(rf.read_text()))
    with open(agg_file, "w") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved aggregate to {agg_file}")


def main():
    parser = argparse.ArgumentParser(description="Temporal drift fine-tuning experiments")
    parser.add_argument("--model", choices=list(MODELS.keys()),
                        help="Model to train")
    parser.add_argument("--epoch", choices=EPOCHS,
                        help="Training epoch")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed (default: 42)")
    parser.add_argument("--all", action="store_true",
                        help="Run all model×epoch×seed combinations")
    parser.add_argument("--eval-only", action="store_true",
                        help="Only run cross-epoch evaluation (skip training)")
    parser.add_argument("--embeddings", action="store_true",
                        help="Extract [CLS] embeddings for drift analysis")
    parser.add_argument("--continual", choices=["forward", "backward"],
                        help="Run continual learning experiment")
    parser.add_argument("--aggregate", action="store_true",
                        help="Aggregate and print all results")
    parser.add_argument("--max-train-samples", type=int, default=None,
                        help="Limit training samples (for debugging)")
    args = parser.parse_args()

    if args.aggregate:
        aggregate_results()
        return

    if args.all:
        for model_key in MODELS:
            for epoch in EPOCHS:
                for seed in SEEDS:
                    train_single(model_key, epoch, seed, args.max_train_samples)
                    evaluate_cross_epoch(model_key, epoch, seed)
                    if args.embeddings:
                        extract_embeddings(model_key, epoch, seed)
        aggregate_results()
        return

    if args.continual:
        if not args.model:
            parser.error("--continual requires --model")
        run_continual(args.model, args.seed, args.continual)
        return

    if not args.model or not args.epoch:
        parser.error("--model and --epoch required (or use --all)")

    if args.eval_only:
        evaluate_cross_epoch(args.model, args.epoch, args.seed)
    elif args.embeddings:
        extract_embeddings(args.model, args.epoch, args.seed)
    else:
        train_single(args.model, args.epoch, args.seed, args.max_train_samples)
        evaluate_cross_epoch(args.model, args.epoch, args.seed)


if __name__ == "__main__":
    main()
