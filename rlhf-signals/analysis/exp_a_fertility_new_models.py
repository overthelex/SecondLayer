"""
Experiment A — Tokenizer fertility for 4 NEW models.

Measures tokens-per-word for: llama4_maverick, qwen3_235b, nemotron_120b, nova_pro
Then merges into existing tokenizer_fertility.json and regenerates the chart.

Usage:
  cd rlhf-signals
  python analysis/exp_a_fertility_new_models.py
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

NEW_MODELS = ["llama4_maverick", "qwen3_235b", "nemotron_120b", "nova_pro"]


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

        # Llama 4 Maverick uses the Converse API / messages format (unlike Llama 3.3)
        # All other new models (Qwen, NVIDIA, Amazon) also use messages format
        if cfg.provider == "Meta" and "llama3" in cfg.model_id:
            # Llama 3.x uses prompt-based format
            body = {
                "prompt": (
                    f"<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n"
                    f"{prompt_text}<|eot_id|>"
                    f"<|start_header_id|>assistant<|end_header_id|>\n\n"
                ),
                "max_gen_len": 10,
                "temperature": 0.0,
            }
        elif cfg.provider == "Amazon":
            # Amazon Nova uses messages format with inferenceConfig
            body = {
                "schemaVersion": "messages-v1",
                "messages": [
                    {"role": "user", "content": [{"text": prompt_text}]}
                ],
                "inferenceConfig": {
                    "maxTokens": 10,
                    "temperature": 0.0,
                },
            }
        else:
            # Llama 4, Qwen, NVIDIA Nemotron — all use standard messages format
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

            # Try multiple paths for input token count
            input_tokens = None

            # Meta/Llama returns prompt_token_count at top level
            if input_tokens is None:
                input_tokens = resp_body.get("prompt_token_count")

            # Standard usage.input_tokens (Mistral, Qwen, many others)
            if input_tokens is None:
                input_tokens = resp_body.get("usage", {}).get("input_tokens")

            # OpenAI-style usage.prompt_tokens (some providers)
            if input_tokens is None:
                input_tokens = resp_body.get("usage", {}).get("prompt_tokens")

            # Amazon Nova: usage.inputTokens
            if input_tokens is None:
                input_tokens = resp_body.get("usage", {}).get("inputTokens")

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
                if "usage" in resp_body:
                    print(f"    Usage keys: {list(resp_body['usage'].keys())}")
                # Print full response for first failure to debug
                if i < 3:
                    print(f"    Full response: {json.dumps(resp_body, indent=2, default=str)[:1000]}")

        except Exception as e:
            print(f"  [{model_key}] Sample {i} error: {e}")
            # Print more detail for first few errors
            if i < 3:
                import traceback
                traceback.print_exc()
            continue

        if (i + 1) % 10 == 0:
            print(f"  [{model_key}] {i + 1}/{len(texts)} done")
        time.sleep(0.3)

    if not results:
        return {
            "model": model_key,
            "display_name": cfg.display_name,
            "n_samples": 0,
            "avg_fertility": 0,
            "std_fertility": 0,
            "median_fertility": 0,
            "avg_chars_per_token": 0,
            "samples": [],
        }

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
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.style.use("seaborn-v0_8-paper")
    plt.rcParams.update({
        "figure.dpi": 300, "savefig.dpi": 300, "font.size": 10,
        "axes.titlesize": 12, "axes.labelsize": 11,
        "savefig.bbox": "tight",
    })

    # Order models by fertility (best = lowest first)
    models = sorted(all_results.keys(), key=lambda m: all_results[m]["avg_fertility"])
    names = [all_results[m]["display_name"] for m in models]
    fertilities = [
        [s["fertility"] for s in all_results[m]["samples"] if s["fertility"]]
        for m in models
    ]

    # 7 distinct colors
    colors = [
        "#3B82F6",  # blue
        "#EF4444",  # red
        "#10B981",  # green
        "#F59E0B",  # amber
        "#8B5CF6",  # purple
        "#EC4899",  # pink
        "#06B6D4",  # cyan
    ]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 6))

    bp = ax1.boxplot(fertilities, labels=names, patch_artist=True, widths=0.5)
    for j, patch in enumerate(bp["boxes"]):
        patch.set_facecolor(colors[j % len(colors)])
        patch.set_alpha(0.7)
    ax1.set_ylabel("Tokens per word (fertility)")
    ax1.set_title("Tokenizer Fertility on Ukrainian Legal Text (7 Models)")
    ax1.axhline(y=1.0, color="gray", linestyle="--", alpha=0.5, label="1:1 (ideal)")
    ax1.legend()
    ax1.tick_params(axis="x", rotation=25)

    avgs = [all_results[m]["avg_fertility"] for m in models]
    chars = [all_results[m]["avg_chars_per_token"] for m in models]

    x = np.arange(len(models))
    width = 0.35

    bars1 = ax2.bar(x - width / 2, avgs, width, label="Avg tokens/word",
                    color=[colors[j % len(colors)] for j in range(len(models))], alpha=0.7)
    ax2_twin = ax2.twinx()
    bars2 = ax2_twin.bar(x + width / 2, chars, width, label="Avg chars/token",
                         color=[colors[j % len(colors)] for j in range(len(models))], alpha=0.3, hatch="//")

    ax2.set_xticks(x)
    ax2.set_xticklabels(names, rotation=25, ha="right")
    ax2.set_ylabel("Tokens per word")
    ax2_twin.set_ylabel("Characters per token")
    ax2.set_title("Fertility & Character Efficiency (sorted by fertility)")

    lines1, labels1 = ax2.get_legend_handles_labels()
    lines2, labels2 = ax2_twin.get_legend_handles_labels()
    ax2.legend(lines1 + lines2, labels1 + labels2, loc="upper right")

    for bar, val in zip(bars1, avgs):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02,
                 f"{val:.2f}", ha="center", va="bottom", fontsize=8, fontweight="bold")

    plt.tight_layout()
    fig.savefig(FIGURES_PATH / "fig_a1_tokenizer_fertility.png")
    plt.close()
    print(f"  Saved: {FIGURES_PATH / 'fig_a1_tokenizer_fertility.png'}")


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: Evaluation data not found at {DATA_PATH}")
        sys.exit(1)

    print("Loading evaluation data...")
    samples = []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        for line in f:
            samples.append(json.loads(line))

    texts = [s["text"] for s in samples[:N_FERTILITY_SAMPLES]]
    print(f"Using {len(texts)} text samples for fertility analysis")

    # Load existing results
    existing_results = {}
    if RESULTS_PATH.exists():
        with open(RESULTS_PATH, "r", encoding="utf-8") as f:
            existing_results = json.load(f)
        print(f"Loaded existing results for: {list(existing_results.keys())}")

    # Measure new models only
    new_results = {}
    for model_key in NEW_MODELS:
        if model_key in existing_results and existing_results[model_key].get("n_samples", 0) > 0:
            print(f"\nSkipping {model_key} — already has {existing_results[model_key]['n_samples']} samples")
            continue

        print(f"\nMeasuring fertility: {MODELS[model_key].display_name}")
        result = measure_fertility_bedrock(model_key, texts)
        new_results[model_key] = result

        if result["n_samples"] > 0:
            print(f"  Avg fertility: {result['avg_fertility']:.3f} tokens/word")
            print(f"  Avg chars/token: {result['avg_chars_per_token']:.2f}")
        else:
            print(f"  WARNING: No successful samples for {model_key}")

    # Merge results
    all_results = {**existing_results, **new_results}

    # Save merged results
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\nMerged results saved to: {RESULTS_PATH}")

    # Print comparison table
    print("\n--- FERTILITY COMPARISON (ALL 7 MODELS) ---")
    print(f"{'Model':<30} {'Fertility':>10} {'Chars/tok':>10} {'Samples':>8}")
    print("-" * 60)

    sorted_models = sorted(all_results.keys(), key=lambda m: all_results[m].get("avg_fertility", 999))
    for m in sorted_models:
        r = all_results[m]
        if r.get("n_samples", 0) > 0:
            print(f"{r['display_name']:<30} {r['avg_fertility']:>10.3f} {r['avg_chars_per_token']:>10.2f} {r['n_samples']:>8}")
        else:
            print(f"{r['display_name']:<30} {'N/A':>10} {'N/A':>10} {0:>8}")

    # Regenerate chart with all models
    try:
        # Only plot models that have data
        plottable = {k: v for k, v in all_results.items() if v.get("n_samples", 0) > 0}
        plot_fertility(plottable)
    except ImportError as e:
        print(f"\nSkipping plots: {e}")
    except Exception as e:
        print(f"\nError plotting: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
