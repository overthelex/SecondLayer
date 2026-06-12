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
