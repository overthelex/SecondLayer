"""
Experiment A — Step 4: Analysis & visualization.

Reads all results and produces paper-quality figures + summary report.

Usage:
  cd rlhf-signals
  python analysis/exp_a_analyze.py
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exp_a_config import MODELS, EVAL_TASKS, RESULTS_DIR, FIGURES_DIR

ROOT = Path(__file__).resolve().parent.parent
RESULTS_PATH = ROOT / RESULTS_DIR
FIGURES_PATH = ROOT / FIGURES_DIR
FIGURES_PATH.mkdir(parents=True, exist_ok=True)

plt.style.use("seaborn-v0_8-paper")
plt.rcParams.update({
    "figure.dpi": 300, "savefig.dpi": 300, "font.size": 10,
    "axes.titlesize": 12, "axes.labelsize": 11,
    "figure.figsize": (10, 6), "savefig.bbox": "tight",
})

COLORS = {
    "qwen3_32b": "#3B82F6", "llama33_70b": "#EF4444", "mistral_large3": "#10B981",
    "llama4_maverick": "#F97316", "qwen3_235b": "#6366F1", "nemotron_120b": "#8B5CF6",
    "nova_pro": "#EC4899",
}


def load_results() -> dict:
    results = {}
    for checkpoint in sorted(RESULTS_PATH.glob("checkpoint_*.json")):
        name = checkpoint.stem.replace("checkpoint_", "")
        with open(checkpoint) as f:
            data = json.load(f)
        if data.get("results"):
            results[name] = data
    if not results:
        print("ERROR: No checkpoint files found")
        sys.exit(1)
    return results


def load_fertility() -> dict | None:
    path = RESULTS_PATH / "tokenizer_fertility.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def plot_accuracy_comparison(results: dict):
    classification_tasks = ["case_type", "case_outcome"]
    modes = ["zero_shot", "few_shot"]
    model_keys = list(MODELS.keys())

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    for ax_idx, task_key in enumerate(classification_tasks):
        ax = axes[ax_idx]
        x = np.arange(len(modes))
        width = 0.25

        for i, model_key in enumerate(model_keys):
            accuracies = []
            for mode in modes:
                key = f"{model_key}_{task_key}_{mode}"
                if key in results and results[key]["results"]:
                    correct = sum(1 for r in results[key]["results"] if r.get("correct"))
                    total = len(results[key]["results"])
                    accuracies.append(correct / total)
                else:
                    accuracies.append(0)

            bars = ax.bar(x + i * width, accuracies, width,
                         label=MODELS[model_key].display_name,
                         color=COLORS[model_key], alpha=0.8)

            for bar, val in zip(bars, accuracies):
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01,
                        f"{val:.1%}", ha="center", va="bottom", fontsize=8, fontweight="bold")

        ax.set_xlabel("Evaluation mode")
        ax.set_ylabel("Accuracy")
        ax.set_title(EVAL_TASKS[task_key].name)
        ax.set_xticks(x + width)
        ax.set_xticklabels(["Zero-shot", "Few-shot"])
        ax.set_ylim(0, 1.05)
        ax.legend(fontsize=8)
        ax.axhline(y=0.25, color="gray", linestyle=":", alpha=0.5, label="Random baseline")

    plt.tight_layout()
    fig.savefig(FIGURES_PATH / "fig_a2_accuracy_comparison.png")
    plt.close()
    print(f"  Saved: fig_a2_accuracy_comparison.png")


def plot_f1_comparison(results: dict):
    model_keys = list(MODELS.keys())
    modes = ["zero_shot", "few_shot"]

    fig, ax = plt.subplots(figsize=(8, 5))
    x = np.arange(len(modes))
    width = 0.25

    for i, model_key in enumerate(model_keys):
        f1_scores = []
        for mode in modes:
            key = f"{model_key}_norm_extraction_{mode}"
            if key in results and results[key]["results"]:
                avg_f1 = np.mean([r.get("f1", 0) for r in results[key]["results"]])
                f1_scores.append(avg_f1)
            else:
                f1_scores.append(0)

        bars = ax.bar(x + i * width, f1_scores, width,
                     label=MODELS[model_key].display_name,
                     color=COLORS[model_key], alpha=0.8)

        for bar, val in zip(bars, f1_scores):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01,
                    f"{val:.3f}", ha="center", va="bottom", fontsize=9, fontweight="bold")

    ax.set_xlabel("Evaluation mode")
    ax.set_ylabel("F1 Score")
    ax.set_title("Legal Norm Extraction — F1 Score")
    ax.set_xticks(x + width)
    ax.set_xticklabels(["Zero-shot", "Few-shot"])
    ax.set_ylim(0, 1.05)
    ax.legend()

    plt.tight_layout()
    fig.savefig(FIGURES_PATH / "fig_a3_norm_extraction_f1.png")
    plt.close()
    print(f"  Saved: fig_a3_norm_extraction_f1.png")


def plot_cost_efficiency(results: dict, fertility: dict | None):
    model_keys = list(MODELS.keys())

    scores = {}
    costs = {}
    for model_key in model_keys:
        task_scores = []
        total_cost = 0
        for task_key in ["case_type", "case_outcome"]:
            key = f"{model_key}_{task_key}_few_shot"
            if key in results and results[key]["results"]:
                correct = sum(1 for r in results[key]["results"] if r.get("correct"))
                total = len(results[key]["results"])
                task_scores.append(correct / total)
                total_cost += results[key].get("cost_usd", 0)
        scores[model_key] = np.mean(task_scores) if task_scores else 0
        costs[model_key] = total_cost

    fig, ax = plt.subplots(figsize=(8, 6))

    for model_key in model_keys:
        fertility_val = None
        if fertility and model_key in fertility:
            fertility_val = fertility[model_key].get("avg_fertility", None)

        size = 200
        if fertility_val:
            size = max(50, 500 / fertility_val)

        ax.scatter(costs[model_key], scores[model_key],
                  s=size, c=COLORS[model_key], alpha=0.8, edgecolors="black", linewidths=1)
        label = MODELS[model_key].display_name
        if fertility_val:
            label += f"\n(fertility: {fertility_val:.2f})"
        ax.annotate(label,
                   (costs[model_key], scores[model_key]),
                   textcoords="offset points", xytext=(10, 10),
                   fontsize=9, fontweight="bold")

    ax.set_xlabel("Cost (USD)")
    ax.set_ylabel("Average classification accuracy (few-shot)")
    ax.set_title("Cost-Efficiency Frontier")
    ax.set_ylim(0, 1.05)

    plt.tight_layout()
    fig.savefig(FIGURES_PATH / "fig_a4_cost_efficiency.png")
    plt.close()
    print(f"  Saved: fig_a4_cost_efficiency.png")


def plot_confusion_matrices(results: dict):
    from exp_a_config import CASE_TYPE_CLASSES, OUTCOME_CLASSES

    model_keys = list(MODELS.keys())
    task_classes = {"case_type": CASE_TYPE_CLASSES, "case_outcome": OUTCOME_CLASSES}

    for task_key, classes in task_classes.items():
        fig, axes = plt.subplots(1, len(model_keys), figsize=(5 * len(model_keys), 4))
        if len(model_keys) == 1:
            axes = [axes]

        for ax, model_key in zip(axes, model_keys):
            key = f"{model_key}_{task_key}_few_shot"
            if key not in results:
                continue

            matrix = np.zeros((len(classes), len(classes)), dtype=int)
            for r in results[key]["results"]:
                gold = r.get("gold", "")
                pred = r.get("predicted", "")
                if gold in classes and pred in classes:
                    gi = classes.index(gold)
                    pi = classes.index(pred)
                    matrix[gi][pi] += 1

            sns.heatmap(matrix, annot=True, fmt="d", cmap="Blues",
                       xticklabels=classes, yticklabels=classes, ax=ax)
            ax.set_title(MODELS[model_key].display_name, fontsize=10)
            ax.set_xlabel("Predicted")
            ax.set_ylabel("Gold")
            ax.tick_params(axis="both", labelsize=7, rotation=45)

        plt.suptitle(f"Confusion Matrix — {EVAL_TASKS[task_key].name} (few-shot)", fontsize=12)
        plt.tight_layout()
        fig.savefig(FIGURES_PATH / f"fig_a5_confusion_{task_key}.png")
        plt.close()
        print(f"  Saved: fig_a5_confusion_{task_key}.png")


def generate_report(results: dict, fertility: dict | None):
    report_lines = [
        "# Experiment A: Tokenizer & Base Model Selection — Results",
        "",
        "## Models Evaluated",
        "",
        "| Model | Provider | Size | Region |",
        "|-------|----------|------|--------|",
    ]
    for m in MODELS.values():
        report_lines.append(f"| {m.display_name} | {m.provider} | — | {m.region} |")

    if fertility:
        report_lines.extend([
            "", "## Tokenizer Fertility", "",
            "| Model | Avg tokens/word | Chars/token | Std |",
            "|-------|----------------|-------------|-----|",
        ])
        for key, f in fertility.items():
            report_lines.append(
                f"| {f['display_name']} | {f['avg_fertility']:.3f} | "
                f"{f['avg_chars_per_token']:.2f} | {f['std_fertility']:.3f} |"
            )

    report_lines.extend(["", "## Task Performance", ""])

    header = "| Model | Task | Mode | Score | Cost |"
    sep = "|-------|------|------|-------|------|"
    report_lines.extend([header, sep])

    for key, result in sorted(results.items()):
        model_key = task_key = mode = None
        for mk in MODELS:
            if key.startswith(mk + "_"):
                rest = key[len(mk) + 1:]
                for tk in EVAL_TASKS:
                    if rest.startswith(tk + "_"):
                        mode = rest[len(tk) + 1:]
                        model_key, task_key = mk, tk
                        break
                if model_key:
                    break
        if not model_key:
            continue

        task = EVAL_TASKS[task_key]
        model_name = MODELS[model_key].display_name

        if task.metric == "accuracy":
            correct = sum(1 for r in result["results"] if r.get("correct"))
            total = len(result["results"])
            score_str = f"{correct/total:.1%}" if total else "N/A"
        elif task.metric == "f1":
            avg_f1 = np.mean([r.get("f1", 0) for r in result["results"]]) if result["results"] else 0
            score_str = f"{avg_f1:.3f}"
        else:
            score_str = "pending"

        cost_str = f"${result.get('cost_usd', 0):.4f}"
        report_lines.append(f"| {model_name} | {task_key} | {mode} | {score_str} | {cost_str} |")

    total_cost = sum(r.get("cost_usd", 0) for r in results.values())
    report_lines.extend([
        "", f"**Total experiment cost: ${total_cost:.2f}**",
        "", "## Recommendation", "",
        "*(To be filled after reviewing results)*",
    ])

    report_path = RESULTS_PATH / "experiment_a_report.md"
    with open(report_path, "w") as f:
        f.write("\n".join(report_lines))
    print(f"  Report: {report_path}")


def main():
    print("Loading results...")
    results = load_results()
    fertility = load_fertility()

    print(f"Found {len(results)} result sets")
    if fertility:
        print(f"Found fertility data for {len(fertility)} models")

    print("\nGenerating figures...")
    plot_accuracy_comparison(results)
    plot_f1_comparison(results)
    plot_cost_efficiency(results, fertility)
    plot_confusion_matrices(results)

    print("\nGenerating report...")
    generate_report(results, fertility)

    print("\nDone.")


if __name__ == "__main__":
    main()
