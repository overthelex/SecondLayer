# SFT distillation pipeline (LEXAI-1732)

Builds citation-grounded ChatML SFT examples from the raw EDRSR retrieval corpus
for the chat-model training plan (Track A / Qwen2.5-14B). Runs **on Brev**, where
the `/data` corpora, the Qdrant `edrsr_decisions` collection, and the GPUs live.

## Pipeline

```
gen-queries  reverse-QA: court decision excerpt -> realistic user question  (Bedrock Haiku)
retrieve     embed query with BGE-M3 -> top-k chunks from Qdrant (+ RAFT distractors,
             + refusal/negative examples with distractor-only context)
teacher      grounded answer with [doc:ID] citations                        (Bedrock Sonnet 4)
judge        faithfulness filter: programmatic citation check + LLM judge
build        assemble sft_chatml.jsonl
```

Every stage is **resumable** (skips ids already in its output JSONL) and writes into
`--work`. Bedrock calls use exponential backoff on throttling and bounded concurrency.

## Models (Bedrock inference profiles, eu-central-1)

Only these Claude models are enabled+invokable in the account/region (probed 2026-06-16);
Sonnet 4 and the 3.x line are access-denied (Legacy / not-enabled).

| Role | Default | Override env |
|------|---------|--------------|
| query-gen | `eu.anthropic.claude-haiku-4-5-20251001-v1:0` | `QUERYGEN_MODEL` |
| teacher | `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` | `TEACHER_MODEL` |
| judge | `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` | `JUDGE_MODEL` (→ haiku-4-5 to cut cost) |

## Run

```bash
# on Brev
cd /data/sft-distill
pip install -r requirements.txt           # FlagEmbedding, boto3, zstandard, requests

# smoke test (≈20 examples end-to-end)
HF_HOME=/data/hf_cache python3 distill.py run-all --work /data/sft-distill/run1 --limit 20 --per-jk 20

# full run: ~per-jk queries per justice_kind (1/3/5) -> SFT target
HF_HOME=/data/hf_cache python3 distill.py run-all --work /data/sft-distill/run_full --per-jk 40000 --workers 16
```

Output: `<work>/sft_chatml.jsonl` — `{messages:[system,user,assistant], meta:{justice_kind,is_refusal}}`.

## Notes / next

- `justice_kind`: tspk(ЦПК)=1, gpk(ГПК)=3, kupap(КУпАП)=5 have fulltext-clean. КПК=2 / КАС=4
  only exist as vectorize exports → add their fulltext before including (CODE_TO_JK).
- Tune `TOP_K`, `N_DISTRACTORS`, `REFUSAL_FRACTION`, `MAX_CHUNK_CHARS` at the top of `distill.py`.
- Feeds LEXAI-1733 (assemble SFT set) → LEXAI-1734 (SFT/RAFT train on 14B).
