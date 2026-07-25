# Experimental Design: Citation-Grounded Evaluation of Dense Retrieval for Ukrainian Legal Search

Working title: *"Citations as Ground Truth: Large-Scale Evaluation of Dense Retrievers
on a Low-Resource Legal Corpus without Human Annotation"*

Target venue: NLLP @ EMNLP 2026 (deadline 2026-08-11), extended version → ECIR / IPM.
Compute: NVIDIA Brev `legalex` (8×H100, expires ~2026-07-19), commercial APIs for eval subset only.

## 1. Research Questions

- **RQ1 (main, methodological):** Can citation-graph-derived relevance replace human
  annotation for *ranking* embedding models on legal retrieval? Validation: does the
  model ranking produced by citation-based eval agree (Kendall's τ) with the ranking
  on human-annotated UA-Legal-Bench / statute-retrieval benchmark?
- **RQ2 (domain adaptation vs scale):** Does a small domain-finetuned embedder
  (BGE-M3-UA, two-stage citation+supervised finetune) outperform large general-purpose
  commercial embedders (Voyage 3.5, OpenAI text-embedding-3-large) on Ukrainian legal text?
- **RQ3 (temporal robustness, ablation):** Is the model ranking stable across decision
  years (2010–2025)? Does retrieval degrade on older cases (terminology drift, new codes,
  martial-law-era law)? Ties into the temporal-drift line of the dissertation.
- **RQ4 (efficiency frontier):** $/1M docs indexed, query latency, index size, GPU-hours —
  which model is Pareto-optimal for production?

## 2. Corpus and Sampling

Source: EDRSR court decisions in local PostgreSQL (local = data proxy) + Qdrant.

Two scales:

| Set | Size | Embedded by | Purpose |
|-----|------|------------|---------|
| **EVAL-500K** | 500K decisions, stratified by jurisdiction (civil / criminal / commercial / administrative) × year (2010–2025) | ALL models incl. commercial APIs | model comparison (RQ1–RQ4) |
| **FULL** | entire corpus | top-2 open models only (winner + runner-up) | scale validation + production index side effect |

Stratification keeps per-cell counts proportional to corpus but with a floor
(min 2K per jurisdiction×year cell) so temporal ablation has power.

**Text preprocessing (critical):** strip all citation strings (case numbers, "справа №",
article references like "ст. 625 ЦК") from document text *before* embedding.
Otherwise dense models trivially match citation tokens and the eval measures lexical
citation overlap, not semantic retrieval. Keep a no-strip variant as an ablation to
quantify the leak. Reuse extraction regexes from `extract-citations-fast.py`.

## 3. Ground Truth from the Citation Graph

Existing asset: 2.39M co-citation edges (`cocitation_edges_raw.csv`).

Relevance signals, graded:

| Grade | Signal |
|-------|--------|
| 3 | direct citation (query case cites candidate case, or vice versa) |
| 2 | strong co-citation: share ≥3 cited articles/precedents (weighted by inverse article frequency — discount ubiquitous articles like ст. 129 Конституції) |
| 1 | weak co-citation: share 1–2 cited articles after IDF weighting |
| 0 | everything else |

- **Query set:** 3,000 query decisions sampled from EVAL-500K, stratified as above;
  each must have ≥5 graded-relevant candidates inside EVAL-500K.
- **IDF weighting is mandatory:** the citation graph is power-law (confirmed in
  degree-centrality analysis); unweighted co-citation makes everything relevant to
  everything through hub articles.
- **Candidate pool:** full EVAL-500K (not re-ranking a BM25 shortlist) — this is the
  honest setting and is what 8×H100 + Qdrant buys us.

## 4. Models

Open (run on Brev, fp16/bf16):

1. **BGE-M3** (BAAI, 568M) — base multilingual
2. **BGE-M3-UA** — our two-stage finetune (stage1: 500K citation pairs, stage2: 65K supervised); retrain final checkpoint on H100 if needed
3. **multilingual-e5-large-instruct** (560M)
4. **Qwen3-Embedding-8B** (or gte-Qwen2-7B-instruct) — large open embedder, MTEB-multilingual SOTA class
5. *(optional, if time)* our CPT-Qwen 1.5B converted to embedder via LLM2Vec — connects CPT line to retrieval

Commercial (EVAL-500K only, via API):

6. **Voyage 3.5** (already partially indexed in prod Qdrant — reuse where chunking matches)
7. **OpenAI text-embedding-3-large**
8. *(optional)* Cohere embed-multilingual-v4

Sparse baselines (CPU, reuse `08_bm25_baseline.R` / `09_bm25_casetext.R`):

9. **BM25** (Ukrainian-stemmed)
10. *(optional)* BM25 + dense hybrid (RRF) for the production recommendation

**Chunking fixed across all models:** 1024 tokens, 128 overlap, doc vector = mean of
chunk vectors. One ablation on the winner: mean-pool vs first-chunk vs max-sim (late
interaction style scoring at query time).

## 5. Metrics and Statistics

- Retrieval: nDCG@{10,100} (graded), Recall@{10,100}, MRR@10.
- RQ1: Kendall's τ between model rankings (citation-eval vs UA-Legal-Bench);
  per-query Pearson r of nDCG scores; report agreement at top-1 ("does it pick the
  same winner").
- Significance: paired bootstrap over queries (10K resamples), Bonferroni over model pairs.
- RQ3: nDCG@10 per year-bucket (2010–14, 2015–19, 2020–21, 2022–25), per-model slopes.
- RQ4: GPU-hours and $ per model (Brev $22.75/hr ÷ 8 GPUs), API $ actuals, p50/p95
  query latency against Qdrant, index RAM/disk.

## 6. Compute Plan (Brev 8×H100)

EVAL-500K ≈ 500K docs × ~3 chunks avg ≈ 1.5M chunks per model.

- 560M-class models: ~2–4K chunks/s on 8 GPUs → **~10–20 min per model**. Trivial.
- Qwen3-8B embedder: ~10× slower → **~2–3 h**.
- FULL corpus (assume ~15M decisions ≈ 45M chunks): winner model ~4–6 h (560M class)
  or ~1.5–2 days (8B class) — feasible either way before Brev expiry.
- BGE-M3-UA retraining on H100: stage1+stage2 ≈ hours (xr-large was 65 min on H100).

Job hygiene (per established practice): **smoke test on 1K docs first** to calibrate
throughput and catch schema issues; atomic jobs = 1 model × 1 corpus slice; checkpoint
every N batches with resume; embeddings written as parquet shards to local NVMe,
synced over wg-sync to local, bulk-loaded to Qdrant named vectors
(`edrsr_eval_{model}` collections); progress logged to MLflow (10.88.0.4:5000).

API cost (EVAL-500K ≈ 1.5B tokens): OpenAI-3-large ~$195, Voyage-3.5 ~$90 (minus
already-indexed overlap), Cohere ~$180. Total commercial ≲ $500.

## 7. Timeline (today = 2026-06-11)

| Week | Work |
|------|------|
| Jun 11–17 | EVAL-500K sampling + citation stripping + graded qrels build; smoke runs on Brev; freeze model list |
| Jun 18–24 | Embed EVAL-500K with all open models; API runs; BGE-M3-UA final train |
| Jun 25–Jul 1 | Retrieval runs + metrics; RQ1 validation vs UA-Legal-Bench; RQ3 temporal slices |
| Jul 2–8 | FULL-corpus run with top-2 (production index side effect); RQ4 efficiency numbers |
| Jul 9–19 | Buffer before Brev expiry; figures (R + tikzDevice); ablations (no-strip leak, pooling) |
| Jul 20–Aug 8 | Writing, internal fact-check pass, NLLP submission Aug 11 |

## 8. Deliverables

1. NLLP paper (citation-grounded eval methodology + UA legal retrieval study).
2. HF dataset under `overthelex`: query set + graded qrels + doc IDs
   ("UA-Legal-Retrieval-Cite", complements UA-Legal-Bench).
3. Production EDRSR embedding index with the winning model (replaces/validates
   current Voyage setup) — direct product value.
4. Reusable eval harness in `scripts/citation-graph/` (extends exp1).

## 9. Risks

- **Citation leakage** despite stripping (paraphrased references, party names shared
  across related cases). Mitigation: no-strip ablation quantifies it; manual audit of
  50 query–candidate pairs.
- **Co-citation ≠ semantic relevance** for boilerplate-heavy procedural decisions.
  Mitigation: IDF weighting; exclude decision types dominated by templates
  (court orders / судові накази) from the query set.
- **RQ1 validation fails** (τ low): that is itself a publishable negative result —
  "citation-based eval does NOT substitute human annotation" — but reframe needed.
- **Brev expiry**: front-load all GPU work; commercial API runs are Brev-independent.
