# BGE-M3 bulk vectorization pipeline (EDRSR, 100M+ docs)

Scripts used for the June 2026 campaign that built BGE-M3 (1024-dim) embeddings
for all EDRSR court decisions on Brev 8xH100 (NVIDIA Innovation Lab) and bulk-loaded
them into Qdrant. Archived here because the Brev instance is temporary.

Tracking: LEXAI-1715 (parent), LEXAI-1718 (ЦПК), LEXAI-1721 (status doc).

## Pipeline (per justice_kind)

1. **Export** — `export_jsonl_fast.py`
   Parallel PG export into N JSONL shards (id-range sharding via percentile split,
   threaded fulltext fetch). `--db-url` passed explicitly (use WG tunnel to prod PG).
2. **Clean** — `clean_edrsr_texts.py` / `clean_parallel.py`
   Strips court headers (addresses, phones, ЄДРПОУ, emails) up to the
   УХВАЛА/РІШЕННЯ/ПОСТАНОВА/ВИРОК marker. Saved ~11.3 GB on ЦПК alone.
3. **Embed** — one of:
   - `embed_ort_trt.py` — ONNX Runtime + TensorRT FP16, ~10K texts/s/GPU (target)
   - `embed_stream.py` — PyTorch baseline, ~1.7K texts/s/GPU, upserts straight to Qdrant
   - `embed_to_disk.py` — embeds to npy + payload JSONL on disk (no Qdrant dependency);
     write output to `/data`, not the root volume
   - `embed_tail.py` — re-embeds tail rows lost to npy truncation (see below)
4. **Upload** — `kas-uploader/` (Go), see below.

## kas-uploader (Go)

Idempotent, streaming, resource-capped bulk uploader for npy + payload JSONL into
Qdrant via gRPC. Replaces the python `upload_stream*.py` scripts.

- **Deterministic point IDs**: `doc_id*100 + chunk_index` — re-runs overwrite instead
  of duplicating; resume is safe by construction.
- Streams npy rows from disk (no full-group RAM load), per-group checkpoint of the
  contiguous confirmed prefix.
- Global caps: network token bucket (bytes/s) + AIMD in-flight window.
- Detects tail-truncated npy files (payload lines without vectors) and defers them
  to a tail re-embed pass instead of failing.

Measured: **~140K points/s (~1 GB/s)** into a local Qdrant on Brev;
74,476,529 points (КАС, justice_kind=4) in ~12 min with 0 errors.

```bash
cd kas-uploader
go mod tidy   # pulls github.com/qdrant/go-client + golang.org/x/time
go build -o kas-uploader .
./kas-uploader -dirs /data/kas-vectorize/export -api-key "$QDRANT_API_KEY" ...
```

## Campaign results (2026-06-12, prod Qdrant `edrsr_decisions`)

| justice_kind | Corpus | Chunks on prod | Status |
|---|---|---|---|
| 1 ЦПК | 38.9M docs | 35,527,796 | done |
| 2 Кримінальне | 20.6M docs | 14,515,496 | done |
| 3 ГПК | 7.5M docs | 13,773,100 | done |
| 4 Адміністративне (КАС) | 22.6M docs | 8,278 (74.5M on Brev-local Qdrant) | transfer to prod pending |
| 5 КУпАП | 12M docs | 69,391,702 | done |

## КУпАП campaign (2026-06-12, LEXAI-1724/1725)

Refined per-year pipeline used for КУпАП (jk=5) and ЦПК (jk=1) re-runs; supersedes
`clean_parallel.py` for per-year `.jsonl.zst` exports:

1. **Clean + global dedup** — `clean_dedup_yearly.py <src_dir> <out_dir>`
   Same header-stripping rules as `clean_parallel.py` + global first-occurrence dedup
   across all year files (by `doc_id`, then by md5 of cleaned text). КУпАП: 11.99M →
   11.83M docs (156K exact-text dups), ~11 min on 23 cores.
2. **Quality gate** — `analyze_dataset.py <dataset_dir>`
   Full-scan stats before embedding: empty/short texts, >15K-char truncation candidates,
   missing fields, residual header noise, length percentiles, chunk estimate.
3. **Filter + reshard** — `reshard_filtered.py <src_dir> <out_dir> [codes] [shards]`
   Filters by `judgment_code` (КУпАП kept {2,5,6} = постанова/ухвала/окрема ухвала)
   and round-robins into N equal plain-JSONL shards, one per embed worker.
4. **Embed** — `embed_ort_trt_32w.py` (evolution of `embed_ort_trt.py`):
   **deterministic point IDs** `uuid5("edrsr/{justice_kind}/{doc_id}/{chunk_index}")`
   — restarts are idempotent, no random-UUID dup cleanup needed (the lesson that
   produced `dedup-qdrant-jk.py`).

КУпАП result: 31,271,465 chunks on Brev `qdrant-gpu` :6343, points == chunks 1:1,
0 failed upserts, HNSW green.

### qdrant-gpu (GPU HNSW indexing) caveats

- NVIDIA driver 580.105.08 segfaults in `libnvidia-eglcore` when qdrant initializes
  >2 Vulkan devices in one process (newer loader / ICD pinning / capabilities=all do
  NOT help). Run with `--gpus '"device=0,1"'` + `QDRANT__GPU__PARALLEL_INDEXES=2` max.
- After a qdrant restart the optimizer stays idle (status `grey`): kick it with
  `PATCH /collections/<name> {"optimizers_config":{}}`.
- `indexed_vectors_count` advances only when whole segments finish — long flat
  periods with both GPUs at 100% are normal.
