#!/usr/bin/env python3
"""Dense retrieval with BGE-M3 (second dense baseline).

Replicates the E5-large experiment (10_dense_retrieval.py) with BAAI/bge-m3
to validate that temporal decay is not model-specific.

Runs on GPU via SageMaker.
Input: S3 data (article texts CSV + citation CSVs + case texts from DB dump)
Output: bge_m3_retrieval_comparison.csv
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

print("=== BGE-M3 Dense Retrieval ===")
print(f"Input dir: {INPUT_DIR}")
print(f"Model dir: {MODEL_DIR}")
print(f"GPUs: {torch.cuda.device_count()}")
for i in range(torch.cuda.device_count()):
    print(f"  GPU {i}: {torch.cuda.get_device_name(i)}")

# ── 1. Load model ────────────────────────────────────────────────

from sentence_transformers import SentenceTransformer

model_name = "BAAI/bge-m3"
print(f"\nLoading {model_name}...")
model = SentenceTransformer(model_name)

def encode_texts(texts, prefix="", batch_size=32):
    return model.encode(texts, batch_size=batch_size, show_progress_bar=True, device="cuda:0")

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

YEARS = [2012, 2016, 2020, 2024]
SAMPLE_CASES = 5000
MIN_CITATIONS = 3

results_exp1 = []

# Fixed-article ablation: find articles present in ALL years
print("\n[2/3] Finding shared articles across all years...")
per_year_articles = {}
per_year_citations = {}
for year in YEARS:
    citation_file = os.path.join(INPUT_DIR, f"map_year_{year}.csv")
    if not os.path.exists(citation_file):
        continue
    case_citations = {}
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
    per_year_citations[year] = case_citations
    per_year_articles[year] = set()
    for arts in case_citations.values():
        per_year_articles[year].update(arts)

shared_articles = set.intersection(*per_year_articles.values()) if per_year_articles else set()
print(f"  Shared articles across {len(YEARS)} years: {len(shared_articles)}")

for year in YEARS:
    print(f"\n  Year {year}...")
    t0 = time.time()

    case_citations = per_year_citations.get(year, {})
    if not case_citations:
        print(f"    SKIP: no citations")
        continue

    # Filter to shared articles only
    filtered = {}
    for case_id, arts in case_citations.items():
        shared = arts & shared_articles
        if MIN_CITATIONS <= len(shared) <= 200:
            filtered[case_id] = shared
    valid_cases = list(filtered.keys())
    case_citations = filtered

    np.random.seed(42)
    if len(valid_cases) > SAMPLE_CASES:
        valid_cases = list(np.random.choice(valid_cases, SAMPLE_CASES, replace=False))

    print(f"    {len(valid_cases)} valid cases, evaluating LOO on article embeddings...")

    # LOO protocol: for each case, mean embedding of seed articles → rank target
    ranks_dense = []

    for case_id in valid_cases:
        cited_keys = case_citations[case_id]
        cited_idx = [article_key_idx[k] for k in cited_keys if k in article_key_idx]
        if len(cited_idx) < MIN_CITATIONS:
            continue

        for j, target in enumerate(cited_idx):
            seed_idx = [idx for idx in cited_idx if idx != target]
            if not seed_idx:
                continue
            seed_emb = article_embeddings[seed_idx].mean(axis=0)
            seed_emb = seed_emb / np.linalg.norm(seed_emb)
            scores = seed_emb @ article_embeddings.T
            target_score = scores[target]
            non_cited_scores = np.delete(scores, cited_idx)
            rank = int(np.sum(non_cited_scores >= target_score)) + 1
            ranks_dense.append(rank)

    mrr_dense = float(np.mean([1.0/r for r in ranks_dense])) if ranks_dense else 0
    hit10_dense = float(np.mean([r <= 10 for r in ranks_dense])) if ranks_dense else 0

    elapsed = time.time() - t0
    results_exp1.append({
        "year": year,
        "n_cases": len(valid_cases),
        "n_predictions": len(ranks_dense),
        "mrr_dense": round(mrr_dense, 4),
        "hit10_dense": round(hit10_dense, 4),
        "elapsed_s": round(elapsed, 1)
    })

    print(f"    Dense MRR={mrr_dense:.4f}, Hit@10={hit10_dense:.4f} ({len(ranks_dense)} preds, {elapsed:.0f}s)")

# Save results
with open(os.path.join(MODEL_DIR, "bge_m3_retrieval_comparison.csv"), "w") as f:
    if results_exp1:
        w = csv.DictWriter(f, fieldnames=results_exp1[0].keys())
        w.writeheader()
        w.writerows(results_exp1)

print(f"\n=== Done. Results in {MODEL_DIR} ===")
