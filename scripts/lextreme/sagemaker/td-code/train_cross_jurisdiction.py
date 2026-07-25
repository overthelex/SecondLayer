#!/usr/bin/env python3
"""
Cross-jurisdiction experiment: compare Ukrainian JP with Swiss JP (LEXTREME).

Experiments:
  A. Zero-shot:  train on SJP (de+fr+it), test on Ukrainian (binary)
  B. Joint:      train on SJP + Ukrainian pre_war, test on Ukrainian full_scale
  C. Transfer:   pre-train on SJP, fine-tune on Ukrainian 3-class
  D. Reverse:    train on Ukrainian, test on SJP (shows transfer direction)

Binary mapping for Ukrainian (needed for A, B, D):
  --binary-mode drop     -> exclude "partial" samples (clean comparison)
  --binary-mode merge    -> merge partial into approved (preserves all data)

SageMaker-compatible: one (experiment, model, seed) per invocation.
Reuses the same MLflow logger and hardware profiles as train_temporal.py.

Usage:
  # Zero-shot: train SJP, test Ukrainian
  python train_cross_jurisdiction.py --experiment zero_shot --model xlm-roberta-base --seed 42

  # Joint training
  python train_cross_jurisdiction.py --experiment joint --model xlm-roberta-base --seed 42

  # Transfer learning (SJP pre-train -> Ukrainian fine-tune)
  python train_cross_jurisdiction.py --experiment transfer --model xlm-roberta-base --seed 42

  # Reverse: train Ukrainian, test SJP
  python train_cross_jurisdiction.py --experiment reverse --model xlm-roberta-base --seed 42

  # All experiments
  python train_cross_jurisdiction.py --all --model xlm-roberta-base
"""

import argparse
import json
import os
import time
from collections import Counter
from pathlib import Path

os.environ["HF_HOME"] = "/tmp/hf_cache"
os.environ["TRANSFORMERS_CACHE"] = "/tmp/hf_cache/transformers"
os.environ["HF_DATASETS_CACHE"] = "/tmp/hf_cache/datasets"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import urllib.request

import numpy as np
import torch
from datasets import Dataset, concatenate_datasets
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.utils.class_weight import compute_class_weight
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)


class WeightedTrainer(Trainer):
    def __init__(self, class_weights=None, **kwargs):
        super().__init__(**kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        if self.class_weights is not None:
            loss_fn = torch.nn.CrossEntropyLoss(weight=self.class_weights.to(logits.device))
        else:
            loss_fn = torch.nn.CrossEntropyLoss()
        loss = loss_fn(logits, labels)
        return (loss, outputs) if return_outputs else loss

from mlflow_logger import end_run, log_artifact, log_dataset, log_metrics, safe_run, start_run

SM_MODEL_DIR = Path(os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))
SM_DATA_DIR = os.environ.get("SM_CHANNEL_DATA", "")

if SM_DATA_DIR:
    UKR_DATA_DIR = Path(SM_DATA_DIR)
    RESULTS_DIR = SM_MODEL_DIR / "results" / "cross_jurisdiction"
else:
    UKR_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "output"
    RESULTS_DIR = Path(__file__).resolve().parent.parent.parent / "results" / "cross_jurisdiction"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

BINARY_LABELS = ["approved", "dismissed"]
BINARY_LABEL2ID = {l: i for i, l in enumerate(BINARY_LABELS)}

THREE_CLASS_LABELS = ["approved", "dismissed", "partial"]
THREE_CLASS_LABEL2ID = {l: i for i, l in enumerate(THREE_CLASS_LABELS)}

UKR_EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
SJP_LANGUAGES = ["de", "fr", "it"]
SEEDS = [42, 123, 456]

MODELS = {
    "xlm-roberta-base": "xlm-roberta-base",
    "xlm-roberta-large": "xlm-roberta-large",
    "legal-xlm-roberta-base": "joelniklaus/legal-xlm-roberta-base",
    "legal-xlm-roberta-large": "joelniklaus/legal-xlm-roberta-large",
}

HARDWARE_PROFILE = os.environ.get("MLFLOW_HARDWARE_TAG", "a10g")

TRAINING_DEFAULTS = {
    "a10g": {
        "base": {"learning_rate": 2e-5, "per_device_train_batch_size": 16, "per_device_eval_batch_size": 32, "gradient_accumulation_steps": 1},
        "large": {"learning_rate": 1e-5, "per_device_train_batch_size": 8, "per_device_eval_batch_size": 16, "gradient_accumulation_steps": 2},
    },
    "h100": {
        "base": {"learning_rate": 2e-5, "per_device_train_batch_size": 64, "per_device_eval_batch_size": 128, "gradient_accumulation_steps": 1},
        "large": {"learning_rate": 1e-5, "per_device_train_batch_size": 32, "per_device_eval_batch_size": 64, "gradient_accumulation_steps": 1},
    },
}


def is_main_process():
    return int(os.environ.get("LOCAL_RANK", 0)) == 0


def get_training_config(model_key):
    hw = TRAINING_DEFAULTS.get(HARDWARE_PROFILE, TRAINING_DEFAULTS["a10g"])
    return hw["large"] if "large" in model_key else hw["base"]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

SJP_ZENODO_BASE = "https://zenodo.org/record/7109926/files"
SJP_SPLIT_MAP = {"train": "train.jsonl", "validation": "val.jsonl", "test": "test.jsonl"}
_sjp_cache: dict[str, list[dict]] = {}


def _download_sjp_split(split: str) -> list[dict]:
    if split in _sjp_cache:
        return _sjp_cache[split]

    filename = SJP_SPLIT_MAP[split]
    url = f"{SJP_ZENODO_BASE}/{filename}"
    cache_path = Path("/tmp/hf_cache") / f"sjp_{filename}"
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    if cache_path.exists():
        print(f"  SJP {split}: loading from cache {cache_path}")
        rows = [json.loads(line) for line in open(cache_path, encoding="utf-8")]
    else:
        print(f"  SJP {split}: downloading {url} ...")
        urllib.request.urlretrieve(url, str(cache_path))
        rows = [json.loads(line) for line in open(cache_path, encoding="utf-8")]
        print(f"  SJP {split}: downloaded {len(rows)} rows")

    _sjp_cache[split] = rows
    return rows


def load_sjp(split="train", languages=None):
    """Load Swiss Judgment Prediction from Zenodo (Niklaus et al. 2021).

    SJP labels are strings: "approval" / "dismissal".
    We map: approval -> approved (0), dismissal -> dismissed (1).
    """
    languages = languages or SJP_LANGUAGES
    lang_label = "+".join(languages)
    label_map = {"approval": "approved", "dismissal": "dismissed"}

    rows = _download_sjp_split(split)
    records = []
    for row in rows:
        lang = row.get("language", "")
        if lang not in languages:
            continue
        text = row.get("text", "")
        raw_label = row.get("label", "")
        mapped = label_map.get(raw_label)
        if not text or mapped is None:
            continue
        records.append({"text": text, "label": BINARY_LABEL2ID[mapped], "language": lang, "source": "sjp"})

    print(f"  SJP {split} [{lang_label}]: {len(records)} samples")
    dist = Counter(r["label"] for r in records)
    print(f"    approved={dist.get(0, 0)}, dismissed={dist.get(1, 0)}")
    return Dataset.from_list(records)


def load_ukr_split(epoch, split, binary_mode="drop"):
    """Load Ukrainian court decisions with optional binary mapping."""
    path = UKR_DATA_DIR / epoch / f"{split}.jsonl"
    records = []
    skipped = 0

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            original_label = r["label"]

            if binary_mode == "drop" and original_label == "partial":
                skipped += 1
                continue
            elif binary_mode == "merge" and original_label == "partial":
                label_id = BINARY_LABEL2ID["approved"]
            else:
                label_id = BINARY_LABEL2ID.get(original_label)
                if label_id is None:
                    skipped += 1
                    continue

            records.append({"text": r["text"], "label": label_id, "language": "uk", "source": "ukr"})

    print(f"  UKR {epoch}/{split}: {len(records)} samples (skipped {skipped}, mode={binary_mode})")
    return Dataset.from_list(records)


def load_ukr_split_3class(epoch, split):
    """Load Ukrainian court decisions with original 3-class labels."""
    path = UKR_DATA_DIR / epoch / f"{split}.jsonl"
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            records.append({"text": r["text"], "label": THREE_CLASS_LABEL2ID[r["label"]], "language": "uk", "source": "ukr"})
    return Dataset.from_list(records)


BCD_LABEL_MAP = {"yes": "approved", "no": "dismissed", "partial": "partial"}
_bcd_cache: dict[str, list[dict]] = {}


def load_bcd(split="train"):
    """Load Brazilian Court Decisions from HuggingFace (joelniklaus/brazilian_court_decisions).

    BCD labels: yes/no/partial → approved/dismissed/partial (same 3-class as Ukrainian).
    Text field: decision_description.
    """
    if split in _bcd_cache:
        rows = _bcd_cache[split]
    else:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download("joelniklaus/brazilian_court_decisions", f"{split}.jsonl", repo_type="dataset")
        rows = [json.loads(line) for line in open(path, encoding="utf-8")]
        _bcd_cache[split] = rows
        print(f"  BCD {split}: loaded {len(rows)} rows")

    records = []
    for row in rows:
        raw_label = row.get("judgment_label", "")
        mapped = BCD_LABEL_MAP.get(raw_label)
        text = row.get("decision_description", "")
        if not text or mapped is None:
            continue
        records.append({"text": text, "label": THREE_CLASS_LABEL2ID[mapped], "language": "pt", "source": "bcd"})

    print(f"  BCD {split}: {len(records)} samples")
    dist = Counter(r["label"] for r in records)
    print(f"    approved={dist.get(0, 0)}, dismissed={dist.get(1, 0)}, partial={dist.get(2, 0)}")
    return Dataset.from_list(records)


def tokenize_dataset(dataset, tokenizer, max_length=512):
    def tokenize_fn(examples):
        return tokenizer(examples["text"], truncation=True, max_length=max_length, padding="max_length")
    return dataset.map(tokenize_fn, batched=True, remove_columns=["text", "language", "source"])


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def make_compute_metrics(label_names):
    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        macro_f1 = f1_score(labels, preds, average="macro")
        per_class_f1 = f1_score(labels, preds, average=None, labels=list(range(len(label_names))))
        acc = accuracy_score(labels, preds)
        result = {"accuracy": acc, "macro_f1": macro_f1}
        for i, name in enumerate(label_names):
            if i < len(per_class_f1):
                result[f"f1_{name}"] = per_class_f1[i]
        return result
    return compute_metrics


def full_eval(trainer, test_ds, label_names):
    metrics = trainer.evaluate(test_ds)
    all_preds = trainer.predict(test_ds)
    preds = np.argmax(all_preds.predictions, axis=-1)
    labels = all_preds.label_ids
    cm = confusion_matrix(labels, preds, labels=list(range(len(label_names))))
    report = classification_report(labels, preds, target_names=label_names, output_dict=True)
    return {
        "accuracy": metrics.get("eval_accuracy", metrics.get("accuracy")),
        "macro_f1": metrics.get("eval_macro_f1", metrics.get("macro_f1")),
        **{f"f1_{name}": report[name]["f1-score"] for name in label_names if name in report},
        "confusion_matrix": cm.tolist(),
        "classification_report": report,
        "n_samples": len(test_ds),
    }


# ---------------------------------------------------------------------------
# Training helper
# ---------------------------------------------------------------------------

def train_model(model_key, train_ds, val_ds, out_dir, seed, num_labels, label2id, id2label, label_names, num_epochs=5, from_checkpoint=None):
    hf_id = from_checkpoint or MODELS[model_key]
    cfg = get_training_config(model_key)

    tokenizer = AutoTokenizer.from_pretrained(MODELS[model_key])
    model = AutoModelForSequenceClassification.from_pretrained(
        hf_id, num_labels=num_labels, label2id=label2id, id2label=id2label, torch_dtype=torch.float32,
        ignore_mismatched_sizes=True if from_checkpoint else False,
    )

    train_tok = tokenize_dataset(train_ds, tokenizer)
    val_tok = tokenize_dataset(val_ds, tokenizer)

    train_labels = np.array(train_ds["label"])
    cw = compute_class_weight("balanced", classes=np.arange(num_labels), y=train_labels)
    class_weights = torch.tensor(cw, dtype=torch.float32)
    print(f"  Class weights: {dict(zip(label_names, [round(w, 3) for w in cw]))}")

    n_gpus = torch.cuda.device_count() or 1
    effective_batch = cfg["per_device_train_batch_size"] * n_gpus * cfg["gradient_accumulation_steps"]
    total_steps = (len(train_tok) // effective_batch) * num_epochs
    warmup_steps = int(total_steps * 0.1)

    training_args = TrainingArguments(
        output_dir=str(out_dir),
        num_train_epochs=num_epochs,
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
        tf32=HARDWARE_PROFILE == "h100",
        torch_compile=False,
        dataloader_num_workers=8 if HARDWARE_PROFILE == "h100" else 4,
        dataloader_pin_memory=True,
        report_to="none",
        ddp_find_unused_parameters=False if n_gpus > 1 else None,
    )

    trainer = WeightedTrainer(
        class_weights=class_weights,
        model=model,
        args=training_args,
        train_dataset=train_tok,
        eval_dataset=val_tok,
        compute_metrics=make_compute_metrics(label_names),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    t0 = time.time()
    trainer.train()
    train_time = time.time() - t0

    if is_main_process():
        trainer.save_model(str(out_dir / "best_model"))
        tokenizer.save_pretrained(str(out_dir / "best_model"))

    return trainer, tokenizer, train_time


# ---------------------------------------------------------------------------
# Experiment A: Zero-shot cross-jurisdiction
# ---------------------------------------------------------------------------

def exp_zero_shot(model_key, seed, binary_mode="drop"):
    """Train on SJP (all languages), test on Ukrainian (binary)."""
    name = f"zero_shot_{model_key}_s{seed}_{binary_mode}"
    out_dir = RESULTS_DIR / name

    if (out_dir / "results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "results.json").read_text())

    print(f"\n{'='*60}\nExp A: Zero-shot  |  {name}\n{'='*60}")

    with safe_run("cross-jurisdiction-zero-shot", {
        "model": model_key, "seed": seed, "binary_mode": binary_mode,
        "experiment": "zero_shot", "train_source": "sjp_all", "test_source": "ukr_binary",
    }, tags={"experiment_type": "cross_jurisdiction"}):

        train_ds = load_sjp("train")
        val_ds = load_sjp("validation")

        trainer, tokenizer, train_time = train_model(
            model_key, train_ds, val_ds, out_dir, seed,
            num_labels=2, label2id=BINARY_LABEL2ID,
            id2label={v: k for k, v in BINARY_LABEL2ID.items()},
            label_names=BINARY_LABELS,
        )

        results = {"model": model_key, "seed": seed, "experiment": "zero_shot",
                    "binary_mode": binary_mode, "train_time_seconds": round(train_time, 1),
                    "train_source": "sjp_all", "eval": {}}

        # Test on SJP test (sanity check)
        sjp_test = tokenize_dataset(load_sjp("test"), tokenizer)
        results["eval"]["sjp_test"] = full_eval(trainer, sjp_test, BINARY_LABELS)
        print(f"  SJP test:  macro_f1={results['eval']['sjp_test']['macro_f1']:.4f}")

        # Test on each Ukrainian epoch (binary)
        for epoch in UKR_EPOCHS:
            ukr_test = tokenize_dataset(load_ukr_split(epoch, "test", binary_mode), tokenizer)
            results["eval"][f"ukr_{epoch}"] = full_eval(trainer, ukr_test, BINARY_LABELS)
            print(f"  UKR {epoch}: macro_f1={results['eval'][f'ukr_{epoch}']['macro_f1']:.4f}")

        log_metrics({f"zs_{k}_macro_f1": v["macro_f1"] for k, v in results["eval"].items()})

        if is_main_process():
            with open(out_dir / "results.json", "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log_artifact(str(out_dir / "results.json"))

    return results


# ---------------------------------------------------------------------------
# Experiment B: Joint training
# ---------------------------------------------------------------------------

def exp_joint(model_key, seed, binary_mode="drop", ukr_train_epoch="pre_war"):
    """Train on SJP + Ukrainian pre_war combined, test on Ukrainian full_scale."""
    name = f"joint_{model_key}_s{seed}_{binary_mode}_{ukr_train_epoch}"
    out_dir = RESULTS_DIR / name

    if (out_dir / "results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "results.json").read_text())

    print(f"\n{'='*60}\nExp B: Joint  |  {name}\n{'='*60}")

    with safe_run("cross-jurisdiction-joint", {
        "model": model_key, "seed": seed, "binary_mode": binary_mode,
        "experiment": "joint", "ukr_train_epoch": ukr_train_epoch,
    }, tags={"experiment_type": "cross_jurisdiction"}):

        sjp_train = load_sjp("train")
        sjp_val = load_sjp("validation")
        ukr_train = load_ukr_split(ukr_train_epoch, "train", binary_mode)
        ukr_val = load_ukr_split(ukr_train_epoch, "validation", binary_mode)

        train_ds = concatenate_datasets([sjp_train, ukr_train]).shuffle(seed=seed)
        val_ds = concatenate_datasets([sjp_val, ukr_val]).shuffle(seed=seed)

        log_dataset("joint-train", train_size=len(train_ds), eval_size=len(val_ds))
        print(f"  Combined train: {len(train_ds)} (SJP {len(sjp_train)} + UKR {len(ukr_train)})")

        trainer, tokenizer, train_time = train_model(
            model_key, train_ds, val_ds, out_dir, seed,
            num_labels=2, label2id=BINARY_LABEL2ID,
            id2label={v: k for k, v in BINARY_LABEL2ID.items()},
            label_names=BINARY_LABELS,
        )

        results = {"model": model_key, "seed": seed, "experiment": "joint",
                    "binary_mode": binary_mode, "ukr_train_epoch": ukr_train_epoch,
                    "train_time_seconds": round(train_time, 1),
                    "train_size": {"sjp": len(sjp_train), "ukr": len(ukr_train)}, "eval": {}}

        sjp_test = tokenize_dataset(load_sjp("test"), tokenizer)
        results["eval"]["sjp_test"] = full_eval(trainer, sjp_test, BINARY_LABELS)
        print(f"  SJP test:  macro_f1={results['eval']['sjp_test']['macro_f1']:.4f}")

        for epoch in UKR_EPOCHS:
            ukr_test = tokenize_dataset(load_ukr_split(epoch, "test", binary_mode), tokenizer)
            results["eval"][f"ukr_{epoch}"] = full_eval(trainer, ukr_test, BINARY_LABELS)
            print(f"  UKR {epoch}: macro_f1={results['eval'][f'ukr_{epoch}']['macro_f1']:.4f}")

        log_metrics({f"joint_{k}_macro_f1": v["macro_f1"] for k, v in results["eval"].items()})

        if is_main_process():
            with open(out_dir / "results.json", "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log_artifact(str(out_dir / "results.json"))

    return results


# ---------------------------------------------------------------------------
# Experiment C: Transfer learning (SJP pre-train -> Ukrainian fine-tune)
# ---------------------------------------------------------------------------

def exp_transfer(model_key, seed, binary_mode="drop"):
    """Pre-train on SJP binary, then fine-tune on Ukrainian 3-class."""
    name = f"transfer_{model_key}_s{seed}"
    out_dir = RESULTS_DIR / name

    if (out_dir / "results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "results.json").read_text())

    print(f"\n{'='*60}\nExp C: Transfer  |  {name}\n{'='*60}")

    with safe_run("cross-jurisdiction-transfer", {
        "model": model_key, "seed": seed,
        "experiment": "transfer", "phase1": "sjp_binary", "phase2": "ukr_3class",
    }, tags={"experiment_type": "cross_jurisdiction"}):

        # Phase 1: pre-train on SJP (binary)
        phase1_dir = out_dir / "phase1_sjp"
        print("\n--- Phase 1: SJP pre-training (binary) ---")
        sjp_train = load_sjp("train")
        sjp_val = load_sjp("validation")

        trainer1, _, t1 = train_model(
            model_key, sjp_train, sjp_val, phase1_dir, seed,
            num_labels=2, label2id=BINARY_LABEL2ID,
            id2label={v: k for k, v in BINARY_LABEL2ID.items()},
            label_names=BINARY_LABELS, num_epochs=3,
        )
        print(f"  Phase 1 done in {t1:.0f}s")

        # Phase 2: fine-tune on Ukrainian 3-class (new classification head)
        phase2_dir = out_dir / "phase2_ukr"
        print("\n--- Phase 2: Ukrainian fine-tuning (3-class) ---")
        ukr_train = load_ukr_split_3class("hybrid_war", "train")
        ukr_val = load_ukr_split_3class("hybrid_war", "validation")

        checkpoint = str(phase1_dir / "best_model")
        trainer2, tokenizer, t2 = train_model(
            model_key, ukr_train, ukr_val, phase2_dir, seed,
            num_labels=3, label2id=THREE_CLASS_LABEL2ID,
            id2label={v: k for k, v in THREE_CLASS_LABEL2ID.items()},
            label_names=THREE_CLASS_LABELS, num_epochs=5,
            from_checkpoint=checkpoint,
        )
        print(f"  Phase 2 done in {t2:.0f}s")

        results = {"model": model_key, "seed": seed, "experiment": "transfer",
                    "phase1_time": round(t1, 1), "phase2_time": round(t2, 1), "eval": {}}

        for epoch in UKR_EPOCHS:
            ukr_test = tokenize_dataset(load_ukr_split_3class(epoch, "test"), tokenizer)
            results["eval"][f"ukr_{epoch}"] = full_eval(trainer2, ukr_test, THREE_CLASS_LABELS)
            print(f"  UKR {epoch}: macro_f1={results['eval'][f'ukr_{epoch}']['macro_f1']:.4f}")

        log_metrics({f"transfer_{k}_macro_f1": v["macro_f1"] for k, v in results["eval"].items()})

        if is_main_process():
            with open(out_dir / "results.json", "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log_artifact(str(out_dir / "results.json"))

    return results


# ---------------------------------------------------------------------------
# Experiment D: Reverse (Ukrainian -> SJP)
# ---------------------------------------------------------------------------

def exp_reverse(model_key, seed, binary_mode="drop", ukr_epoch="hybrid_war"):
    """Train on Ukrainian (binary), test on SJP. Shows transfer asymmetry."""
    name = f"reverse_{model_key}_s{seed}_{binary_mode}_{ukr_epoch}"
    out_dir = RESULTS_DIR / name

    if (out_dir / "results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "results.json").read_text())

    print(f"\n{'='*60}\nExp D: Reverse  |  {name}\n{'='*60}")

    with safe_run("cross-jurisdiction-reverse", {
        "model": model_key, "seed": seed, "binary_mode": binary_mode,
        "experiment": "reverse", "ukr_epoch": ukr_epoch,
    }, tags={"experiment_type": "cross_jurisdiction"}):

        train_ds = load_ukr_split(ukr_epoch, "train", binary_mode)
        val_ds = load_ukr_split(ukr_epoch, "validation", binary_mode)

        trainer, tokenizer, train_time = train_model(
            model_key, train_ds, val_ds, out_dir, seed,
            num_labels=2, label2id=BINARY_LABEL2ID,
            id2label={v: k for k, v in BINARY_LABEL2ID.items()},
            label_names=BINARY_LABELS,
        )

        results = {"model": model_key, "seed": seed, "experiment": "reverse",
                    "binary_mode": binary_mode, "ukr_epoch": ukr_epoch,
                    "train_time_seconds": round(train_time, 1), "eval": {}}

        # Test on SJP
        for lang in SJP_LANGUAGES:
            sjp_test = tokenize_dataset(load_sjp("test", [lang]), tokenizer)
            results["eval"][f"sjp_{lang}"] = full_eval(trainer, sjp_test, BINARY_LABELS)
            print(f"  SJP {lang}: macro_f1={results['eval'][f'sjp_{lang}']['macro_f1']:.4f}")

        sjp_test_all = tokenize_dataset(load_sjp("test"), tokenizer)
        results["eval"]["sjp_all"] = full_eval(trainer, sjp_test_all, BINARY_LABELS)
        print(f"  SJP all:  macro_f1={results['eval']['sjp_all']['macro_f1']:.4f}")

        # Also test on Ukrainian (sanity)
        ukr_test = tokenize_dataset(load_ukr_split(ukr_epoch, "test", binary_mode), tokenizer)
        results["eval"]["ukr_self"] = full_eval(trainer, ukr_test, BINARY_LABELS)
        print(f"  UKR self: macro_f1={results['eval']['ukr_self']['macro_f1']:.4f}")

        log_metrics({f"rev_{k}_macro_f1": v["macro_f1"] for k, v in results["eval"].items()})

        if is_main_process():
            with open(out_dir / "results.json", "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log_artifact(str(out_dir / "results.json"))

    return results


# ---------------------------------------------------------------------------
# Experiment E: BCD comparison (3-class, same task as Ukrainian)
# ---------------------------------------------------------------------------

def exp_bcd_baseline(model_key, seed, binary_mode="drop"):
    """Train XLM-R on BCD, evaluate on BCD + Ukrainian. Direct 3-class comparison."""
    name = f"bcd_baseline_{model_key}_s{seed}"
    out_dir = RESULTS_DIR / name

    if (out_dir / "results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "results.json").read_text())

    print(f"\n{'='*60}\nExp E: BCD baseline  |  {name}\n{'='*60}")

    with safe_run("cross-jurisdiction-bcd-baseline", {
        "model": model_key, "seed": seed,
        "experiment": "bcd_baseline",
    }, tags={"experiment_type": "cross_jurisdiction"}):

        train_ds = load_bcd("train")
        val_ds = load_bcd("validation")

        trainer, tokenizer, train_time = train_model(
            model_key, train_ds, val_ds, out_dir, seed,
            num_labels=3, label2id=THREE_CLASS_LABEL2ID,
            id2label={v: k for k, v in THREE_CLASS_LABEL2ID.items()},
            label_names=THREE_CLASS_LABELS, num_epochs=10,
        )

        results = {"model": model_key, "seed": seed, "experiment": "bcd_baseline",
                    "train_time_seconds": round(train_time, 1), "eval": {}}

        bcd_test = tokenize_dataset(load_bcd("test"), tokenizer)
        results["eval"]["bcd_test"] = full_eval(trainer, bcd_test, THREE_CLASS_LABELS)
        print(f"  BCD test:  macro_f1={results['eval']['bcd_test']['macro_f1']:.4f}")

        for epoch in UKR_EPOCHS:
            ukr_test = tokenize_dataset(load_ukr_split_3class(epoch, "test"), tokenizer)
            results["eval"][f"ukr_{epoch}"] = full_eval(trainer, ukr_test, THREE_CLASS_LABELS)
            print(f"  UKR {epoch}: macro_f1={results['eval'][f'ukr_{epoch}']['macro_f1']:.4f}")

        log_metrics({f"bcd_{k}_macro_f1": v["macro_f1"] for k, v in results["eval"].items()})

        if is_main_process():
            with open(out_dir / "results.json", "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log_artifact(str(out_dir / "results.json"))

    return results


def exp_bcd_reverse(model_key, seed, binary_mode="drop", ukr_epoch="hybrid_war"):
    """Train on Ukrainian 3-class, test on BCD. Shows UKR→BCD transfer."""
    name = f"bcd_reverse_{model_key}_s{seed}_{ukr_epoch}"
    out_dir = RESULTS_DIR / name

    if (out_dir / "results.json").exists():
        print(f"SKIP {name}: already done")
        return json.loads((out_dir / "results.json").read_text())

    print(f"\n{'='*60}\nExp F: BCD reverse  |  {name}\n{'='*60}")

    with safe_run("cross-jurisdiction-bcd-reverse", {
        "model": model_key, "seed": seed, "ukr_epoch": ukr_epoch,
        "experiment": "bcd_reverse",
    }, tags={"experiment_type": "cross_jurisdiction"}):

        train_ds = load_ukr_split_3class(ukr_epoch, "train")
        val_ds = load_ukr_split_3class(ukr_epoch, "validation")

        trainer, tokenizer, train_time = train_model(
            model_key, train_ds, val_ds, out_dir, seed,
            num_labels=3, label2id=THREE_CLASS_LABEL2ID,
            id2label={v: k for k, v in THREE_CLASS_LABEL2ID.items()},
            label_names=THREE_CLASS_LABELS,
        )

        results = {"model": model_key, "seed": seed, "experiment": "bcd_reverse",
                    "ukr_epoch": ukr_epoch, "train_time_seconds": round(train_time, 1), "eval": {}}

        bcd_test = tokenize_dataset(load_bcd("test"), tokenizer)
        results["eval"]["bcd_test"] = full_eval(trainer, bcd_test, THREE_CLASS_LABELS)
        print(f"  BCD test:  macro_f1={results['eval']['bcd_test']['macro_f1']:.4f}")

        ukr_test = tokenize_dataset(load_ukr_split_3class(ukr_epoch, "test"), tokenizer)
        results["eval"]["ukr_self"] = full_eval(trainer, ukr_test, THREE_CLASS_LABELS)
        print(f"  UKR self:  macro_f1={results['eval']['ukr_self']['macro_f1']:.4f}")

        log_metrics({f"bcd_rev_{k}_macro_f1": v["macro_f1"] for k, v in results["eval"].items()})

        if is_main_process():
            with open(out_dir / "results.json", "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            log_artifact(str(out_dir / "results.json"))

    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

EXPERIMENTS = {
    "zero_shot": exp_zero_shot,
    "joint": exp_joint,
    "transfer": exp_transfer,
    "reverse": exp_reverse,
    "bcd_baseline": exp_bcd_baseline,
    "bcd_reverse": exp_bcd_reverse,
}


def main():
    parser = argparse.ArgumentParser(description="Cross-jurisdiction JP experiments (Ukrainian vs Swiss/Brazilian)")
    parser.add_argument("--experiment", choices=list(EXPERIMENTS.keys()), help="Which experiment to run")
    parser.add_argument("--model", choices=list(MODELS.keys()), default="xlm-roberta-base")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--binary-mode", choices=["drop", "merge"], default="drop",
                        help="How to map Ukrainian 3-class to binary (drop partial vs merge into approved)")
    parser.add_argument("--all", action="store_true", help="Run all experiments for given model")
    parser.add_argument("--all-seeds", action="store_true", help="Run across all 3 seeds")
    args = parser.parse_args()

    seeds = SEEDS if args.all_seeds else [args.seed]

    if args.all:
        for seed in seeds:
            exp_zero_shot(args.model, seed, args.binary_mode)
            exp_joint(args.model, seed, args.binary_mode)
            exp_transfer(args.model, seed, args.binary_mode)
            exp_reverse(args.model, seed, args.binary_mode)
            exp_bcd_baseline(args.model, seed, args.binary_mode)
            exp_bcd_reverse(args.model, seed, args.binary_mode)
        return

    if not args.experiment:
        parser.error("--experiment required (or use --all)")

    for seed in seeds:
        EXPERIMENTS[args.experiment](args.model, seed, args.binary_mode)


if __name__ == "__main__":
    main()
