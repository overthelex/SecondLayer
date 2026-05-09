"""
Experiment A — Step 2: Tokenizer fertility analysis.

Measures tokens-per-word for each model on Ukrainian legal text via Bedrock API.
Sends text samples and reads input token counts from response metadata.

Usage:
  cd rlhf-signals
  python analysis/exp_a_tokenizer_fertility.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import boto3
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exp_a_config import MODELS, RESULTS_DIR, FIGURES_DIR, EVAL_DATA_PATH, N_FERTILITY_SAMPLES

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / EVAL_DATA_PATH
RESULTS_PATH = ROOT / RESULTS_DIR / "tokenizer_fertility.json"
FIGURES_PATH = ROOT / FIGURES_DIR

FIGURES_PATH.mkdir(parents=True, exist_ok=True)


def count_words(text: str) -> int:
    return len(re.findall(r'\b\w+\b', text))


def count_chars(text: str) -> int:
    return len(text)


def measure_fertility_bedrock(
    model_key: str,
    texts: list[str],
) -> dict:
    cfg = MODELS[model_key]
    client = boto3.client("bedrock-runtime", region_name=cfg.region)

    results = []
    for i, text in enumerate(texts):
        truncated = text[:6000]
        word_count = count_words(truncated)
        char_count = count_chars(truncated)

        prompt_text = f"Повтори перше слово цього тексту:\n\n{truncated}"

        if cfg.provider == "Meta":
            # Llama on Bedrock uses prompt-based format (not messages)
            body = {
                "prompt": (
                    f"<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n"
                    f"{prompt_text}<|eot_id|>"
                    f"<|start_header_id|>assistant<|end_header_id|>\n\n"
                ),
                "max_gen_len": 10,
                "temperature": 0.0,
            }
        else:
            body = {
                "messages": [
                    {"role": "user", "content": prompt_text}
                ],
                "max_tokens": 10,
                "temperature": 0.0,
            }

        try:
            response = client.invoke_model(
                modelId=cfg.model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            resp_body = json.loads(response["body"].read())

            # Meta/Llama returns prompt_token_count at top level
            input_tokens = resp_body.get("prompt_token_count")
            if input_tokens is None:
                input_tokens = resp_body.get("usage", {}).get("input_tokens")
            if input_tokens is None:
                input_tokens = resp_body.get("usage", {}).get("prompt_tokens")

            if input_tokens is not None:
                results.append({
                    "sample_idx": i,
                    "word_count": word_count,
                    "char_count": char_count,
                    "input_tokens": input_tokens,
                    "fertility": input_tokens / word_count if word_count > 0 else None,
                    "chars_per_token": char_count / input_tokens if input_tokens > 0 else None,
                })
            else:
                print(f"  [{model_key}] Sample {i}: no token count in response")
                print(f"    Response keys: {list(resp_body.keys())}")

        except Exception as e:
            print(f"  [{model_key}] Sample {i} error: {e}")
            continue

        if (i + 1) % 10 == 0:
            print(f"  [{model_key}] {i + 1}/{len(texts)} done")
        time.sleep(0.2)

    return {
        "model": model_key,
        "display_name": cfg.display_name,
        "n_samples": len(results),
        "avg_fertility": float(np.mean([r["fertility"] for r in results if r["fertility"]])),
        "std_fertility": float(np.std([r["fertility"] for r in results if r["fertility"]])),
        "median_fertility": float(np.median([r["fertility"] for r in results if r["fertility"]])),
        "avg_chars_per_token": float(np.mean([r["chars_per_token"] for r in results if r["chars_per_token"]])),
        "samples": results,
    }


def plot_fertility(all_results: dict):
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mticker

    plt.style.use("seaborn-v0_8-paper")
    plt.rcParams.update({
        "figure.dpi": 300, "savefig.dpi": 300, "font.size": 10,
        "axes.titlesize": 12, "axes.labelsize": 11,
        "figure.figsize": (10, 5), "savefig.bbox": "tight",
    })

    models = list(all_results.keys())
    names = [all_results[m]["display_name"] for m in models]
    fertilities = [
        [s["fertility"] for s in all_results[m]["samples"] if s["fertility"]]
        for m in models
    ]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    colors = ["#3B82F6", "#EF4444", "#10B981"]

    bp = ax1.boxplot(fertilities, labels=names, patch_artist=True, widths=0.5)
    for patch, color in zip(bp["boxes"], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)
    ax1.set_ylabel("Tokens per word (fertility)")
    ax1.set_title("Tokenizer Fertility on Ukrainian Legal Text")
    ax1.axhline(y=1.0, color="gray", linestyle="--", alpha=0.5, label="1:1 (ideal)")
    ax1.legend()

    avgs = [all_results[m]["avg_fertility"] for m in models]
    chars = [all_results[m]["avg_chars_per_token"] for m in models]

    x = np.arange(len(models))
    width = 0.35

    bars1 = ax2.bar(x - width / 2, avgs, width, label="Avg tokens/word", color=colors, alpha=0.7)
    ax2_twin = ax2.twinx()
    bars2 = ax2_twin.bar(x + width / 2, chars, width, label="Avg chars/token", color=colors, alpha=0.3, hatch="//")

    ax2.set_xticks(x)
    ax2.set_xticklabels(names, rotation=15)
    ax2.set_ylabel("Tokens per word")
    ax2_twin.set_ylabel("Characters per token")
    ax2.set_title("Fertility & Character Efficiency")

    lines1, labels1 = ax2.get_legend_handles_labels()
    lines2, labels2 = ax2_twin.get_legend_handles_labels()
    ax2.legend(lines1 + lines2, labels1 + labels2, loc="upper right")

    for bar, val in zip(bars1, avgs):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                 f"{val:.2f}", ha="center", va="bottom", fontsize=9, fontweight="bold")

    plt.tight_layout()
    fig.savefig(FIGURES_PATH / "fig_a1_tokenizer_fertility.png")
    plt.close()
    print(f"  Saved: {FIGURES_PATH / 'fig_a1_tokenizer_fertility.png'}")


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: Evaluation data not found at {DATA_PATH}")
        print("Run exp_a_extract_eval.py first.")
        sys.exit(1)

    print("Loading evaluation data...")
    samples = []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        for line in f:
            samples.append(json.loads(line))

    texts = [s["text"] for s in samples[:N_FERTILITY_SAMPLES]]
    print(f"Using {len(texts)} text samples for fertility analysis")

    all_results = {}

    for model_key in MODELS:
        print(f"\nMeasuring fertility: {MODELS[model_key].display_name}")
        result = measure_fertility_bedrock(model_key, texts)
        all_results[model_key] = result
        print(f"  Avg fertility: {result['avg_fertility']:.3f} tokens/word")
        print(f"  Avg chars/token: {result['avg_chars_per_token']:.2f}")

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to: {RESULTS_PATH}")

    print("\n--- FERTILITY COMPARISON ---")
    print(f"{'Model':<25} {'Fertility':>10} {'Chars/tok':>10} {'Samples':>8}")
    print("-" * 55)
    for m in all_results:
        r = all_results[m]
        print(f"{r['display_name']:<25} {r['avg_fertility']:>10.3f} {r['avg_chars_per_token']:>10.2f} {r['n_samples']:>8}")

    try:
        plot_fertility(all_results)
    except ImportError:
        print("\nSkipping plots (matplotlib not installed)")


if __name__ == "__main__":
    main()
