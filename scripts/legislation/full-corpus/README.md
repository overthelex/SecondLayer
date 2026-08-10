# Full Ukrainian legislation corpus with editions → bge-m3 → Qdrant

Pipeline to build the full НПА corpus (~293K acts, ~407K edition-texts) from Rada
open-data + OpenData API, chunk, embed with bge-m3 on Brev GPU, and upsert into a new
Qdrant collection `legislation_full_bge`.

Design spec: `docs/superpowers/specs/2026-07-08-legislation-full-corpus-editions-design.md`

## Where each stage runs

- **Stage 0–3 on prod** (Frankfurt EC2) — `data.rada.gov.ua` is reachable from prod and
  local Kyiv, but **NOT from Brev (GCP, gео-blocked)**. Working DB `rada_npa` lives on
  prod postgres `127.0.0.1:5438` (isolated from the main DB).
- **Stage 4 on Brev** (8×H100) — only JSONL chunk shards are shipped over WG for GPU embed.

```
export DBURL="postgresql://secondlayer:$PW@127.0.0.1:5438/rada_npa"   # on prod
```

## Run

```bash
# --- prod ---
psql "$DBURL" -f schema.sql
bash 00_fetch_bulk.sh /data/rada_npa/bulk           # download doc/doc-dates/dict
python3 01_load_master.py   /data/rada_npa/bulk     # → rada_docs_master (293K), rada_dict
python3 02_load_editions.py /data/rada_npa/bulk     # → rada_events (663K), rada_editions (407K)

# Stage 2: fetch every edition text. Texts go to NDJSON shards on disk, NOT postgres —
# a 200-row x 1MB INSERT OOM-killed the prod pg backend. Do not run 03 by hand: the
# supervisor owns the fleet and relaunches it every time it drains (see below).
setsid nohup ./supervise.sh </dev/null >>/data/rada_npa/supervise.log 2>&1 &
#   progress: cat /data/rada_npa/texts/*/done.txt | wc -l
#   finished: /data/rada_npa/STAGE2_COMPLETE.flag appears

# Stage 3: chunk → JSONL shards
python3 04_chunk.py --shards 8 --out /data/rada_npa/shards

# --- ship shards prod → brev ---
rsync -az /data/rada_npa/shards/ brev.lex:/data/rada_npa/shards/

# --- brev (GPU) ---  reuse the proven bge-m3 ORT CUDA embed+upsert script
#   scripts/legislation/bge-m3-vectorize/embed_legislation_ort_trt.py
docker run -d --name leg-full-embed --gpus all --network host -v /data:/data \
  nvcr.io/nvidia/tensorrt:25.05-py3 bash -c \
  'pip install -q onnxruntime-gpu transformers tokenizers qdrant-client && \
   python3 /data/rada_npa/embed_legislation_ort_trt.py \
     --data-dir /data/rada_npa/shards \
     --qdrant-url http://<serving-qdrant>:6333 --qdrant-api-key <KEY> \
     --collection legislation_full_bge --num-gpus 8 --batch-size 64 --recreate-collection'
```

## Stage 2 fleet

`supervise.sh` → `run_fetch_multiip.sh` → 6 × `03_fetch_texts.py`, one per prod secondary
IP/EIP. Workers exit when their bucket drains, but a drained bucket still leaves transient
failures unresolved, so the supervisor re-splits the remainder and relaunches until the
pending set is empty or two rounds in a row gain nothing. Without it the fleet simply stops:
in 2026-07 all six nodes exited normally with ~236K rows still pending and sat idle a month.

Rates are set by measurement, not by what the sources tolerate (see the header comments in
`run_fetch_multiip.sh` for the numbers):

- **data.rada OpenData is primary** and saturates *globally, not per IP* — 4 nodes × 1.0/s
  pushed it from 2.4s to 11-14s and ~73% of requests became transient failures. 0.7/s per
  node holds at ~0.65/s persisted with ~0 transients.
- **zakon.rada is a side channel** (measured 0.15/s persisted and *zero* 200s at 1.0/s). It
  still resolves 404s and answers OpenData's 403s.
- **403 does not mean banned.** OpenData returns 403 for a missing edition, any pre-1991
  date, and international treaties. Since the pending list is sorted by ed_date its head is
  a solid 403 zone, so the ban guard uses a 403 wave only to trigger a canary fetch of a
  known-200 document; the canary decides, and a confirmed ban drops that node to zakon.
- Liveness is the worker-written `texts/node*/worker.pid` + `kill -0`, never a `ps`/`pgrep`
  pattern (every pattern also matches the ssh/bash command line containing the script name).

## Notes
- Rada OpenData API requires header `User-Agent: OpenData`.
- Editions = podid 4 (Прийняття) + 0 (Редакція) + 6 (Нова редакція) from `doc-dates.txt`.
- `03` is fully resumable: it loads a **global** done-set across every `texts/*/done.txt`, so
  re-splitting the buckets differently never refetches. Only 200/404 are persisted as
  definitive; transient results stay pending for the next round.
- `done.txt` counts **resolved**, not fetched: it includes 404s. Coverage is the 200 count.
- `04` collapses consecutive byte-identical editions into one embedded version
  (`valid_from`/`valid_to`), article-splits where «Стаття N» exists.
- Cutover: after validation, point prod search to `legislation_full_bge` via
  `LEG_BGE_COLLECTION` (see `project_legislation_bge_migration`).
