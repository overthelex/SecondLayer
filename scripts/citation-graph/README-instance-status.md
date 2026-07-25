# EDRSR instance-status layer (overruled / dissent)

Builds the Ukrainian analogue of a "which passage is losing law" signal for the citation
graph, shaped for EDRSR. Finnish courts pack overruled reasoning + dissents into **one**
decision document; EDRSR stores **one document per instance**, so the trap is cross-document:
retrieval pulls a first/appeal-instance decision that a higher court later *скасував*. This
pipeline marks those lower decisions `overruled` and attaches окремі думки as `dissent`,
as a lighter layer over the existing `neo4j-citation` graph.

Feeds the role-aware citation judge (LEXAI-1842 / LEXAI-1850): a citation landing on an
overruled or dissent decision becomes a same-case hard negative.

## Pipeline

| Stage | Script | Where | Output |
|---|---|---|---|
| 0 | `instance-status-00-probe.sql` | Brev `edrsr_local` | sizing (instances, chains, judgment_code, reversal-rate sample) |
| 1 | `instance-status-01-prep.sql` | Brev `edrsr_local` | `isl_multi_cases`, `isl_chain` |
| 2 | `instance-status-02-extract-disposition.py` | Brev (14 workers) | `edrsr_instance_disposition` |
| 3 | `instance-status-03-overruled-dissent.sql` | Brev | `edrsr_overruled`, `edrsr_dissent` |
| 4 | `instance-status-neo4j-load.cypher` via `instance-status-neo4j-chunk-load.sh` | prod host | graph SUPERSEDED_BY / HAS_DISSENT + Decision.status |
| 5 (opt) | `instance-status-04a-export-other.py` → `04b-infer-qwen.py` → `04c-merge-llm.sql` | Brev GPU | recover reversals from the regex "other" bucket, produce `edrsr_overruled_delta` |

The classifier (stage 2) anchors on the operative part (slice after the last
«ПОСТАНОВИВ / ВИРІШИВ / УХВАЛИВ», spaced-letter tolerant) and matches the disposition verb
with a decision-noun co-presence guard (so "скасувати арешт" ≠ overrule). Stage 5 sends the
`other` bucket to Qwen2.5-72B-Instruct on Brev to recover reversals phrased outside the regex.

## Results (full corpus, 135.2M docs, 2026-07-22)

- `edrsr_instance_disposition`: 3,041,803 (affirmed 1.69M / reversed 976K / modified 50K / other 303K).
- `edrsr_overruled`: ~693,729 (first-instance 589,829 + appeal 103,900). LLM stage recovered
  +10,942 clean additions (from 18,663 recovered reversers). NB the count is fuzzy in the
  679K–705K band: same-date lower-doc ties make the "which lower doc" pick ambiguous.
- `edrsr_dissent`: 9,736 окрема-думка docs → 14,614 parent decisions.
- Prod `neo4j-citation`: **SUPERSEDED_BY = 704,671** (693,729 regex + 10,942 llm, `r.method`),
  **HAS_DISSENT = 17,542**, `Decision.status ∈ {overruled, dissent}`.

## Gotchas

- Decision nodes key on `doc_id` as a **STRING** (index `decision_doc_id`), not `id`, not int.
- prod graph is Neo4j **Community** with `db.transaction.timeout=5s`; it cannot be raised at
  runtime (no `dbms.setConfigValue`, no APOC) and the prod container must not be restarted →
  bulk loads are chunked into sub-5s pieces (`instance-status-neo4j-chunk-load.sh`).
- this cypher-shell takes the query **positionally** (no `-c`); call it via `docker exec`
  directly (a `bash -lc` wrapper loses it from PATH).
- Brev vLLM (0.11.2) needs `VLLM_ATTENTION_BACKEND=FLASH_ATTN` + `FLASHINFER_DISABLE_VERSION_CHECK=1`
  + `enforce_eager=True`, and `HF_HOME=/data/hf_cache HF_HUB_OFFLINE=1`.
- `DISTINCT ON` on same-date ties is non-deterministic; stage 3 adds a `low.doc_id DESC`
  tiebreak for stable rebuilds, and stage 5 filters the graph delta to `by_method='llm_qwen'`
  to exclude tie-churn.

## Instance codes (edrsr_instances)

`1 = Касаційна (cassation)`, `2 = Апеляційна (appeal)`, `3 = Перша (first)`. Next-lower
instance for a higher decision at instance I is `I + 1`. `judgment_code`: 2=постанова,
3=рішення, 1=вирок, 5=ухвала (procedural), **10=окрема думка (dissent)**.
