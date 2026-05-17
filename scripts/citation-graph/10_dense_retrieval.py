#!/usr/bin/env python3
"""Dense retrieval baseline + embedding drift analysis.

Experiment 1: Dense Retrieval (case→article via E5-large)
  - Embed article texts once
  - Embed case texts (citation-stripped) per year
  - Score = cosine(case_emb, article_emb)
  - Compare temporal decay with graph methods

Experiment 2: Embedding Drift
  - For each article, collect case snippets citing it per year
  - Embed snippets → centroid per article per year
  - Measure drift = 1 - cosine(centroid_2012, centroid_2024)
  - Correlate with MRR decay

Runs on 4× A10G GPUs via DataParallel.
Input: S3 data (article texts CSV + citation CSVs + case texts from DB dump)
Output: dense_retrieval_comparison.csv, embedding_drift.csv
"""

import os
import csv
import json
import time
import glob
import re
import sys
import numpy as np
import torch
from pathlib import Path

csv.field_size_limit(sys.maxsize)

# SageMaker paths
INPUT_DIR = os.environ.get("SM_CHANNEL_DATA", "/opt/ml/input/data/data")
MODEL_DIR = os.environ.get("SM_MODEL_DIR", "/opt/ml/model")
ARTICLE_CSV = os.environ.get("ARTICLE_CSV", "/opt/ml/input/data/articles/codex_articles.csv")

os.makedirs(MODEL_DIR, exist_ok=True)

print("=== Dense Retrieval + Embedding Drift ===")
print(f"Input dir: {INPUT_DIR}")
print(f"Model dir: {MODEL_DIR}")
print(f"GPUs: {torch.cuda.device_count()}")
for i in range(torch.cuda.device_count()):
    print(f"  GPU {i}: {torch.cuda.get_device_name(i)}")

# ── 1. Load model ────────────────────────────────────────────────

from sentence_transformers import SentenceTransformer

model_name = "intfloat/multilingual-e5-large"
print(f"\nLoading {model_name}...")
model = SentenceTransformer(model_name)

def encode_texts(texts, prefix="passage: ", batch_size=256):
    prefixed = [prefix + t for t in texts]
    return model.encode(prefixed, batch_size=batch_size, show_progress_bar=True, device="cuda:0")

# ── 2. Load article texts ───────────────────────────────────────

print("\n[1/4] Loading article texts...")

# Load from CSV (DB export + RADA parsed)
articles = {}
for csv_path in glob.glob(os.path.join(INPUT_DIR, "articles", "*.csv")):
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row.get("article_key", f"{row['law_name']}|{row['article_number']}")
            if key not in articles and len(row["full_text"]) > 30:
                articles[key] = row["full_text"][:2000]  # cap for embedding

print(f"  {len(articles)} articles with text")

# Embed articles
article_keys = sorted(articles.keys())
article_texts = [articles[k] for k in article_keys]
article_key_idx = {k: i for i, k in enumerate(article_keys)}

print("  Embedding articles...")
t0 = time.time()
article_embeddings = encode_texts(article_texts, prefix="passage: ")
print(f"  Done: {article_embeddings.shape} ({time.time()-t0:.1f}s)")

# Normalize for cosine
article_embeddings = article_embeddings / np.linalg.norm(article_embeddings, axis=1, keepdims=True)

# ── 3. Citation stripping regex ──────────────────────────────────

CITE_PATTERN = re.compile(
    r"ст\.?\s*\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*\s*"
    r"(?:Цивільного|Кримінального|Господарського|Сімейного|Податкового|"
    r"Земельного|Водного|Лісового|Житлового|Бюджетного|Митного)\s*"
    r"(?:процесуального\s*)?кодексу\s*України|"
    r"ст\.?\s*\d+(?:-\d+)?\s*(?:ЦК|КК|ЦПК|КПК|ГПК|КАС|КУпАП|КЗпП|СК|ПК|ЗК)"
    r"(?:\s*України)?|"
    r"ст\.?\s*\d+(?:-\d+)?\s*Конституції\s*України"
)

LAW_NORM = {
    "КУпАП": "Кодекс України про адміністративні правопорушення",
    "КупАП": "Кодекс України про адміністративні правопорушення",
    "КУПАП": "Кодекс України про адміністративні правопорушення",
    "КУпАп": "Кодекс України про адміністративні правопорушення",
    "КЗпП": "Кодекс законів про працю України",
}

# ── 4. Experiment 1: Dense Retrieval per Year ────────────────────

print("\n[2/4] Experiment 1: Dense Retrieval Baseline...")

YEARS = [2008, 2012, 2016, 2020, 2024]
SAMPLE_CASES = 5000  # cases per year (embedding is expensive)
MIN_CITATIONS = 3

results_exp1 = []

for year in YEARS:
    print(f"\n  Year {year}...")
    t0 = time.time()

    # Load citation data
    citation_file = os.path.join(INPUT_DIR, f"map_year_{year}.csv")
    if not os.path.exists(citation_file):
        print(f"    SKIP: {citation_file} not found")
        continue

    # Parse citations
    case_citations = {}  # case_id → set of article_keys
    with open(citation_file, encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 3:
                continue
            case_id, law_name, art_num = row[0], row[1], row[2]
            if not re.match(r"^\d+(-\d+)?$", art_num):
                continue
            law_name = LAW_NORM.get(law_name, law_name)
            key = f"{law_name}|{art_num}"
            if key in article_key_idx:
                case_citations.setdefault(case_id, set()).add(key)

    # Filter cases
    valid_cases = [c for c, arts in case_citations.items()
                   if MIN_CITATIONS <= len(arts) <= 200]

    # Sample
    np.random.seed(42)
    if len(valid_cases) > SAMPLE_CASES:
        valid_cases = list(np.random.choice(valid_cases, SAMPLE_CASES, replace=False))

    print(f"    {len(valid_cases)} cases, loading texts...")

    # Load case texts from dump
    case_text_file = os.path.join(INPUT_DIR, "case_texts", f"cases_{year}.csv")
    case_texts = {}
    if os.path.exists(case_text_file):
        with open(case_text_file, encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 2 and row[0] in set(valid_cases):
                    text = CITE_PATTERN.sub(" ", row[1])
                    if len(text) > 100:
                        case_texts[row[0]] = text[:1500]  # cap

    if not case_texts:
        print(f"    SKIP: no case texts for {year}")
        continue

    eval_cases = [c for c in valid_cases if c in case_texts]
    print(f"    {len(eval_cases)} cases with text, embedding...")

    # Embed case texts
    queries = [case_texts[c] for c in eval_cases]
    query_embeddings = encode_texts(queries, prefix="query: ")
    query_embeddings = query_embeddings / np.linalg.norm(query_embeddings, axis=1, keepdims=True)

    # Score: cosine similarity → all articles
    scores = query_embeddings @ article_embeddings.T  # (n_cases, n_articles)

    # Evaluate: for each case, rank cited articles
    ranks_dense = []
    ranks_graph = []  # placeholder — graph scores loaded from precomputed

    for i, case_id in enumerate(eval_cases):
        cited_keys = case_citations[case_id]
        cited_idx = [article_key_idx[k] for k in cited_keys if k in article_key_idx]
        if len(cited_idx) < MIN_CITATIONS:
            continue

        case_scores = scores[i]
        for j, target in enumerate(cited_idx):
            # Rank among non-cited articles
            non_cited_scores = np.delete(case_scores, cited_idx)
            rank = int(np.sum(non_cited_scores >= case_scores[target])) + 1
            ranks_dense.append(rank)

    mrr_dense = float(np.mean([1.0/r for r in ranks_dense])) if ranks_dense else 0
    hit10_dense = float(np.mean([r <= 10 for r in ranks_dense])) if ranks_dense else 0

    elapsed = time.time() - t0
    results_exp1.append({
        "year": year,
        "n_cases": len(eval_cases),
        "n_predictions": len(ranks_dense),
        "mrr_dense": round(mrr_dense, 4),
        "hit10_dense": round(hit10_dense, 4),
        "elapsed_s": round(elapsed, 1)
    })

    print(f"    Dense MRR={mrr_dense:.4f}, Hit@10={hit10_dense:.4f} ({len(ranks_dense)} preds, {elapsed:.0f}s)")

# Save Exp 1
with open(os.path.join(MODEL_DIR, "dense_retrieval_comparison.csv"), "w") as f:
    if results_exp1:
        w = csv.DictWriter(f, fieldnames=results_exp1[0].keys())
        w.writeheader()
        w.writerows(results_exp1)

# ── 5. Experiment 2: Embedding Drift ────────────────────────────

print("\n[3/4] Experiment 2: Embedding Drift...")

DRIFT_YEARS = [2012, 2024]
SNIPPETS_PER_ARTICLE = 50
MAX_ARTICLES_DRIFT = 500  # top articles by frequency

# Collect citation contexts per article per year
drift_data = {}  # year → article_key → [snippet_texts]

for year in DRIFT_YEARS:
    print(f"\n  Year {year}: collecting snippets...")
    case_text_file = os.path.join(INPUT_DIR, "case_texts", f"cases_{year}.csv")
    if not os.path.exists(case_text_file):
        print(f"    SKIP: no case texts")
        continue

    citation_file = os.path.join(INPUT_DIR, f"map_year_{year}.csv")

    # Build case → articles map
    case_arts = {}
    with open(citation_file, encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) < 3:
                continue
            case_id, law_name, art_num = row[0], row[1], row[2]
            if not re.match(r"^\d+(-\d+)?$", art_num):
                continue
            law_name = LAW_NORM.get(law_name, law_name)
            key = f"{law_name}|{art_num}"
            if key in article_key_idx:
                case_arts.setdefault(case_id, set()).add(key)

    # Collect snippets from case texts
    article_snippets = {}  # article_key → [texts]
    with open(case_text_file, encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            case_id, text = row[0], row[1]
            if case_id not in case_arts:
                continue
            # Use first 500 chars as context snippet
            snippet = text[:500]
            for art_key in case_arts[case_id]:
                if art_key not in article_snippets:
                    article_snippets[art_key] = []
                if len(article_snippets[art_key]) < SNIPPETS_PER_ARTICLE:
                    article_snippets[art_key].append(snippet)

    drift_data[year] = article_snippets
    print(f"    {len(article_snippets)} articles with snippets")

# Compute centroids
if len(drift_data) == 2 and all(y in drift_data for y in DRIFT_YEARS):
    y1, y2 = DRIFT_YEARS
    shared_arts = sorted(set(drift_data[y1].keys()) & set(drift_data[y2].keys()))

    # Take top MAX_ARTICLES_DRIFT by snippet count
    art_counts = {a: min(len(drift_data[y1].get(a, [])), len(drift_data[y2].get(a, []))) for a in shared_arts}
    shared_arts = sorted(art_counts, key=art_counts.get, reverse=True)[:MAX_ARTICLES_DRIFT]
    shared_arts = [a for a in shared_arts if art_counts[a] >= 10]

    print(f"\n  Computing centroids for {len(shared_arts)} shared articles...")

    drift_results = []

    for art_key in shared_arts:
        snippets_y1 = drift_data[y1][art_key]
        snippets_y2 = drift_data[y2][art_key]

        emb_y1 = encode_texts(snippets_y1, prefix="passage: ", batch_size=64)
        emb_y2 = encode_texts(snippets_y2, prefix="passage: ", batch_size=64)

        centroid_y1 = emb_y1.mean(axis=0)
        centroid_y2 = emb_y2.mean(axis=0)

        # Normalize
        centroid_y1 = centroid_y1 / np.linalg.norm(centroid_y1)
        centroid_y2 = centroid_y2 / np.linalg.norm(centroid_y2)

        cosine_sim = float(centroid_y1 @ centroid_y2)
        drift = 1.0 - cosine_sim

        drift_results.append({
            "article_key": art_key,
            "n_snippets_y1": len(snippets_y1),
            "n_snippets_y2": len(snippets_y2),
            "cosine_similarity": round(cosine_sim, 4),
            "drift": round(drift, 4)
        })

    # Save
    with open(os.path.join(MODEL_DIR, "embedding_drift.csv"), "w") as f:
        if drift_results:
            w = csv.DictWriter(f, fieldnames=drift_results[0].keys())
            w.writeheader()
            w.writerows(drift_results)

    # Summary
    drifts = [r["drift"] for r in drift_results]
    print(f"\n  Drift {y1}→{y2}: mean={np.mean(drifts):.4f}, median={np.median(drifts):.4f}")
    print(f"  Max drift: {max(drifts):.4f} ({drift_results[np.argmax(drifts)]['article_key']})")
    print(f"  Min drift: {min(drifts):.4f} ({drift_results[np.argmin(drifts)]['article_key']})")

print(f"\n=== Done. Results in {MODEL_DIR} ===")
