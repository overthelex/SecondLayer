#!/usr/bin/env python3
"""
Phase B Results Analysis Pipeline (Phase 9)

Loads Prolific annotations, computes quality metrics, aggregates per-sample,
classifies crowd edits, and compares vs oversight (founder) edits.

Expected input format (one JSON per line):
{
    "sample_id": "...",
    "annotator_id": "...",
    "edited_text": "...",
    "time_seconds": 120,
    "confidence": 4
}
"""

import json
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path

# ============================================================
# Configuration
# ============================================================

OUTPUT_DIR = Path(__file__).parent
BATCH_FILE = OUTPUT_DIR / "prolific_batch.jsonl"

# Edit distance thresholds (same as oversight classification)
THRESHOLDS = {
    "cosmetic": 0.10,          # edit_distance_norm <= 0.10
    "tone_adjustment": 0.20,   # 0.10 < edit_distance_norm <= 0.20
    "reorganization": 0.35,    # 0.20 < edit_distance_norm <= 0.35
    "substantive_rewrite": 0.65,  # 0.35 < edit_distance_norm <= 0.65
    "rejection": 1.0,          # edit_distance_norm > 0.65
}

# Minimum attention check pass rate to include annotator
MIN_ATTENTION_PASS_RATE = 0.5


# ============================================================
# Edit Distance Computation
# ============================================================

def levenshtein_distance(s1, s2):
    """Compute Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def normalized_edit_distance(original, edited):
    """Compute normalized edit distance (0 = identical, 1 = completely different)."""
    if not original and not edited:
        return 0.0
    max_len = max(len(original), len(edited))
    if max_len == 0:
        return 0.0
    dist = levenshtein_distance(original, edited)
    return dist / max_len


def classify_edit(edit_distance_norm):
    """Classify edit based on normalized edit distance."""
    if edit_distance_norm <= THRESHOLDS["cosmetic"]:
        return "cosmetic"
    elif edit_distance_norm <= THRESHOLDS["tone_adjustment"]:
        return "tone_adjustment"
    elif edit_distance_norm <= THRESHOLDS["reorganization"]:
        return "reorganization"
    elif edit_distance_norm <= THRESHOLDS["substantive_rewrite"]:
        return "substantive_rewrite"
    else:
        return "rejection"


# ============================================================
# Data Loading
# ============================================================

def load_batch():
    """Load the prolific batch to get original texts."""
    batch = {}
    with open(BATCH_FILE) as f:
        for line in f:
            item = json.loads(line)
            batch[item["sample_id"]] = item
    return batch


def load_annotations(annotations_path):
    """Load annotator results."""
    annotations = []
    with open(annotations_path) as f:
        for line in f:
            if line.strip():
                annotations.append(json.loads(line))
    return annotations


# ============================================================
# Quality Metrics
# ============================================================

def compute_annotator_quality(annotations, batch):
    """Compute per-annotator quality based on attention checks."""
    by_annotator = defaultdict(list)
    for ann in annotations:
        by_annotator[ann["annotator_id"]].append(ann)

    quality = {}
    for annotator_id, anns in by_annotator.items():
        # Find attention check annotations
        attention_anns = [a for a in anns if batch.get(a["sample_id"], {}).get("is_attention_check", False)]
        total_checks = len(attention_anns)
        passed = 0

        for a in attention_anns:
            sample = batch[a["sample_id"]]
            check_type = sample.get("check_type", "")

            if check_type == "embedded_instruction":
                # Check if 'verified' appears at the start
                if a["edited_text"].strip().lower().startswith("verified"):
                    passed += 1
            elif check_type == "garbled_reject":
                # Check if annotator indicated rejection or rewrote substantially
                original = sample["input_text"]
                ned = normalized_edit_distance(original, a["edited_text"])
                # Garbled text should trigger heavy editing or explicit rejection
                if ned > 0.5 or "reject" in a["edited_text"].lower() or "nonsens" in a["edited_text"].lower():
                    passed += 1

        pass_rate = passed / total_checks if total_checks > 0 else 1.0

        # Time stats
        times = [a["time_seconds"] for a in anns if not batch.get(a["sample_id"], {}).get("is_attention_check", False)]
        avg_time = statistics.mean(times) if times else 0
        median_time = statistics.median(times) if times else 0

        quality[annotator_id] = {
            "total_annotations": len(anns),
            "attention_checks_total": total_checks,
            "attention_checks_passed": passed,
            "attention_pass_rate": pass_rate,
            "avg_time_seconds": avg_time,
            "median_time_seconds": median_time,
            "included": pass_rate >= MIN_ATTENTION_PASS_RATE,
        }

    return quality


# ============================================================
# Aggregation
# ============================================================

def aggregate_per_sample(annotations, batch, annotator_quality):
    """Aggregate annotations per sample (median edit from included annotators)."""
    # Filter to included annotators
    included_annotators = {aid for aid, q in annotator_quality.items() if q["included"]}

    by_sample = defaultdict(list)
    for ann in annotations:
        if ann["annotator_id"] in included_annotators:
            sample_id = ann["sample_id"]
            if not batch.get(sample_id, {}).get("is_attention_check", False):
                by_sample[sample_id].append(ann)

    results = {}
    for sample_id, anns in by_sample.items():
        original = batch[sample_id]["input_text"]

        # Compute edit distances for each annotator
        edit_distances = []
        for a in anns:
            ned = normalized_edit_distance(original, a["edited_text"])
            edit_distances.append({
                "annotator_id": a["annotator_id"],
                "edit_distance_norm": ned,
                "edit_class": classify_edit(ned),
                "time_seconds": a["time_seconds"],
                "confidence": a.get("confidence"),
            })

        # Median edit distance
        neds = [ed["edit_distance_norm"] for ed in edit_distances]
        median_ned = statistics.median(neds) if neds else 0.0

        # Find the annotation closest to median (representative edit)
        closest_idx = min(range(len(neds)), key=lambda i: abs(neds[i] - median_ned))

        results[sample_id] = {
            "sample_id": sample_id,
            "n_annotations": len(anns),
            "median_edit_distance_norm": median_ned,
            "median_edit_class": classify_edit(median_ned),
            "all_edit_distances": neds,
            "representative_annotator": edit_distances[closest_idx]["annotator_id"],
            "edit_details": edit_distances,
        }

    return results


# ============================================================
# Comparison vs Oversight
# ============================================================

def compare_vs_oversight(aggregated, crowd_samples_path):
    """Compare crowd edit distribution vs founder (oversight) edits."""
    # Load oversight data
    oversight = {}
    with open(crowd_samples_path) as f:
        for line in f:
            item = json.loads(line)
            oversight[item["sample_id"]] = {
                "edit_class": item["metadata"]["edit_class"],
                "edit_distance_norm": float(item["metadata"]["edit_distance_norm"]),
            }

    # Build comparison vectors
    common_ids = set(aggregated.keys()) & set(oversight.keys())
    if not common_ids:
        return {"error": "No overlapping sample IDs"}

    crowd_neds = []
    oversight_neds = []
    crowd_classes = []
    oversight_classes_reclassified = []

    for sid in sorted(common_ids):
        crowd_neds.append(aggregated[sid]["median_edit_distance_norm"])
        oversight_neds.append(oversight[sid]["edit_distance_norm"])
        crowd_classes.append(aggregated[sid]["median_edit_class"])
        # Re-classify oversight using same NED thresholds for apples-to-apples comparison
        # (oversight original classes may use a different taxonomy like factual_correction)
        oversight_classes_reclassified.append(classify_edit(oversight[sid]["edit_distance_norm"]))

    # --- KS Test (two-sample) ---
    ks_stat = ks_two_sample(crowd_neds, oversight_neds)

    # --- Chi-square test on edit class distribution ---
    class_labels = ["cosmetic", "tone_adjustment", "reorganization", "substantive_rewrite", "rejection"]
    crowd_class_counts = Counter(crowd_classes)
    oversight_class_counts = Counter(oversight_classes_reclassified)

    observed = [crowd_class_counts.get(c, 0) for c in class_labels]
    expected = [oversight_class_counts.get(c, 0) for c in class_labels]
    chi2 = chi_square(observed, expected)

    # --- Agreement (exact class match) ---
    exact_matches = sum(1 for c, o in zip(crowd_classes, oversight_classes_reclassified) if c == o)
    agreement_rate = exact_matches / len(common_ids)

    # --- Krippendorff's alpha (ordinal) ---
    # Encode classes as ordinal: cosmetic=0, tone=1, reorg=2, subst=3, reject=4
    class_to_ord = {c: i for i, c in enumerate(class_labels)}
    crowd_ordinal = [class_to_ord[c] for c in crowd_classes]
    oversight_ordinal = [class_to_ord[c] for c in oversight_classes_reclassified]
    alpha = krippendorff_alpha_ordinal(crowd_ordinal, oversight_ordinal)

    return {
        "n_common_samples": len(common_ids),
        "ks_statistic": ks_stat,
        "chi_square": chi2,
        "exact_class_agreement": agreement_rate,
        "krippendorff_alpha": alpha,
        "crowd_class_distribution": dict(crowd_class_counts),
        "oversight_class_distribution": dict(oversight_class_counts),
        "crowd_ned_stats": {
            "mean": statistics.mean(crowd_neds),
            "median": statistics.median(crowd_neds),
            "stdev": statistics.stdev(crowd_neds) if len(crowd_neds) > 1 else 0,
        },
        "oversight_ned_stats": {
            "mean": statistics.mean(oversight_neds),
            "median": statistics.median(oversight_neds),
            "stdev": statistics.stdev(oversight_neds) if len(oversight_neds) > 1 else 0,
        },
    }


# ============================================================
# Statistical Tests (stdlib-only implementations)
# ============================================================

def ks_two_sample(sample1, sample2):
    """Two-sample Kolmogorov-Smirnov statistic."""
    s1 = sorted(sample1)
    s2 = sorted(sample2)
    n1 = len(s1)
    n2 = len(s2)

    # Merge and compute ECDFs
    all_values = sorted(set(s1 + s2))
    max_diff = 0.0

    for v in all_values:
        # ECDF of sample1 at v
        ecdf1 = sum(1 for x in s1 if x <= v) / n1
        ecdf2 = sum(1 for x in s2 if x <= v) / n2
        max_diff = max(max_diff, abs(ecdf1 - ecdf2))

    return max_diff


def chi_square(observed, expected):
    """Chi-square statistic between observed and expected counts."""
    # Normalize expected to same total as observed
    total_obs = sum(observed)
    total_exp = sum(expected)
    if total_exp == 0:
        return float("inf")

    chi2 = 0.0
    for o, e in zip(observed, expected):
        e_scaled = e * total_obs / total_exp
        if e_scaled > 0:
            chi2 += (o - e_scaled) ** 2 / e_scaled
    return chi2


def krippendorff_alpha_ordinal(ratings1, ratings2):
    """
    Simplified Krippendorff's alpha for ordinal data with 2 coders.
    Uses ordinal distance metric: d(c,k) = sum of n_g for g between c and k.
    Simplified: treats as interval for 2-coder case.
    """
    n = len(ratings1)
    if n < 2:
        return 0.0

    # Observed disagreement
    d_o = 0.0
    for r1, r2 in zip(ratings1, ratings2):
        d_o += (r1 - r2) ** 2
    d_o /= n

    # Expected disagreement (all pairwise comparisons)
    all_ratings = ratings1 + ratings2
    n_total = len(all_ratings)
    d_e = 0.0
    count = 0
    for i in range(n_total):
        for j in range(i + 1, n_total):
            d_e += (all_ratings[i] - all_ratings[j]) ** 2
            count += 1
    d_e /= count if count > 0 else 1

    if d_e == 0:
        return 1.0

    alpha = 1.0 - d_o / d_e
    return alpha


# ============================================================
# Synthetic Test Data
# ============================================================

def generate_synthetic_annotations(batch, n_annotators=3, n_samples=10):
    """Generate synthetic annotations for testing the pipeline."""
    random.seed(123)

    # Pick n_samples real (non-attention-check) samples
    real_samples = [s for s in batch.values() if not s.get("is_attention_check", False)]
    selected = random.sample(real_samples, min(n_samples, len(real_samples)))

    # Add attention check samples
    attention_samples = [s for s in batch.values() if s.get("is_attention_check", False)]

    annotator_ids = [f"SYNTH_ANNOTATOR_{i:03d}" for i in range(n_annotators)]
    annotations = []

    for sample in selected + attention_samples:
        for annotator_id in annotator_ids:
            original = sample["input_text"]

            if sample.get("is_attention_check"):
                if sample.get("check_type") == "embedded_instruction":
                    # 80% chance of passing
                    if random.random() < 0.8:
                        edited = "verified " + original
                    else:
                        edited = original  # Failed
                elif sample.get("check_type") == "garbled_reject":
                    # 90% chance of passing (heavy edit or reject note)
                    if random.random() < 0.9:
                        edited = "[This text is nonsensical and appears to be randomly shuffled words.]"
                    else:
                        edited = original  # Failed
                else:
                    edited = original
            else:
                # Simulate edits with varying intensity
                edit_intensity = random.betavariate(2, 5)  # Skew toward small edits
                if edit_intensity < 0.1:
                    # No change
                    edited = original
                elif edit_intensity < 0.3:
                    # Small change: swap a few words
                    words = original.split()
                    n_swaps = max(1, int(len(words) * 0.1))
                    for _ in range(n_swaps):
                        if len(words) > 2:
                            i = random.randint(0, len(words) - 2)
                            words[i], words[i+1] = words[i+1], words[i]
                    edited = " ".join(words)
                else:
                    # Larger change: remove/add words
                    words = original.split()
                    n_remove = int(len(words) * edit_intensity * 0.5)
                    for _ in range(min(n_remove, len(words) - 1)):
                        idx = random.randint(0, len(words) - 1)
                        words.pop(idx)
                    edited = " ".join(words)

            time_seconds = random.randint(30, 300)
            confidence = random.randint(2, 5)

            annotations.append({
                "sample_id": sample["sample_id"],
                "annotator_id": annotator_id,
                "edited_text": edited,
                "time_seconds": time_seconds,
                "confidence": confidence,
            })

    return annotations


# ============================================================
# Main Analysis Pipeline
# ============================================================

def run_analysis(annotations_path=None, use_synthetic=False):
    """Run the full analysis pipeline."""
    print("=" * 60)
    print("Phase B Results Analysis")
    print("=" * 60)

    # Load batch
    print("\nLoading batch data...")
    batch = load_batch()
    print(f"  Loaded {len(batch)} batch items")

    # Load or generate annotations
    if use_synthetic:
        print("\nGenerating synthetic annotations for testing...")
        annotations = generate_synthetic_annotations(batch)
        # Save synthetic for reference
        synth_path = OUTPUT_DIR / "synthetic_annotations.jsonl"
        with open(synth_path, "w") as f:
            for ann in annotations:
                f.write(json.dumps(ann, ensure_ascii=False) + "\n")
        print(f"  Generated {len(annotations)} synthetic annotations")
        print(f"  Saved to {synth_path}")
    elif annotations_path:
        print(f"\nLoading annotations from {annotations_path}...")
        annotations = load_annotations(annotations_path)
        print(f"  Loaded {len(annotations)} annotations")
    else:
        print("\nERROR: No annotations provided. Use --synthetic for testing.")
        return

    # Step 1: Annotator quality
    print("\n--- Step 1: Annotator Quality ---")
    annotator_quality = compute_annotator_quality(annotations, batch)
    for aid, q in sorted(annotator_quality.items()):
        status = "INCLUDED" if q["included"] else "EXCLUDED"
        print(f"  {aid}: {q['attention_checks_passed']}/{q['attention_checks_total']} checks, "
              f"avg time {q['avg_time_seconds']:.0f}s [{status}]")

    included_count = sum(1 for q in annotator_quality.values() if q["included"])
    excluded_count = sum(1 for q in annotator_quality.values() if not q["included"])
    print(f"\n  Total: {included_count} included, {excluded_count} excluded")

    # Step 2: Per-sample aggregation
    print("\n--- Step 2: Per-Sample Aggregation ---")
    aggregated = aggregate_per_sample(annotations, batch, annotator_quality)
    print(f"  Aggregated {len(aggregated)} samples")

    if aggregated:
        all_median_neds = [a["median_edit_distance_norm"] for a in aggregated.values()]
        print(f"  Median NED across samples: {statistics.median(all_median_neds):.4f}")
        print(f"  Mean NED across samples: {statistics.mean(all_median_neds):.4f}")

        # Class distribution
        class_dist = Counter(a["median_edit_class"] for a in aggregated.values())
        print(f"  Class distribution: {dict(class_dist)}")

    # Step 3: Compare vs oversight
    print("\n--- Step 3: Comparison vs Oversight ---")
    crowd_samples_path = OUTPUT_DIR.parent / "crowd-samples.jsonl"
    if crowd_samples_path.exists() and aggregated:
        comparison = compare_vs_oversight(aggregated, crowd_samples_path)
        print(f"  Common samples: {comparison['n_common_samples']}")
        print(f"  KS statistic: {comparison['ks_statistic']:.4f}")
        print(f"  Chi-square: {comparison['chi_square']:.4f}")
        print(f"  Exact class agreement: {comparison['exact_class_agreement']:.2%}")
        print(f"  Krippendorff's alpha: {comparison['krippendorff_alpha']:.4f}")
        print(f"\n  Crowd NED: mean={comparison['crowd_ned_stats']['mean']:.4f}, "
              f"median={comparison['crowd_ned_stats']['median']:.4f}")
        print(f"  Oversight NED: mean={comparison['oversight_ned_stats']['mean']:.4f}, "
              f"median={comparison['oversight_ned_stats']['median']:.4f}")
    else:
        print("  Skipped (no oversight data or no aggregated results)")
        comparison = None

    # Step 4: Write results
    print("\n--- Writing Results ---")
    results = {
        "annotator_quality": annotator_quality,
        "aggregated_samples": {k: {
            "sample_id": v["sample_id"],
            "n_annotations": v["n_annotations"],
            "median_edit_distance_norm": v["median_edit_distance_norm"],
            "median_edit_class": v["median_edit_class"],
            "all_edit_distances": v["all_edit_distances"],
        } for k, v in aggregated.items()},
        "comparison_vs_oversight": comparison,
        "summary": {
            "total_annotations": len(annotations),
            "annotators_included": included_count,
            "annotators_excluded": excluded_count,
            "samples_analyzed": len(aggregated),
        },
    }

    results_path = OUTPUT_DIR / "analysis_results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"  Results written to {results_path}")

    print("\n" + "=" * 60)
    print("Analysis complete.")
    print("=" * 60)


# ============================================================
# CLI Entry Point
# ============================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--synthetic":
        run_analysis(use_synthetic=True)
    elif len(sys.argv) > 1:
        run_analysis(annotations_path=sys.argv[1])
    else:
        print("Usage:")
        print("  python analyze_phase_b_results.py --synthetic     # Test with synthetic data")
        print("  python analyze_phase_b_results.py <path.jsonl>    # Analyze real annotations")
        print()
        print("Running synthetic test...")
        run_analysis(use_synthetic=True)
