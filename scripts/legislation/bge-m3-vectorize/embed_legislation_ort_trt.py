#!/usr/bin/env python3
"""
STEP 3 (run on Brev, inside NGC TensorRT container): embed pre-chunked legislation
JSONL shards with bge-m3 via ONNX Runtime + TensorRT FP16, one process per GPU,
and upsert straight into the big Qdrant (bigbox) collection legal_sections_bge.

Fork of /data/kupap-vectorize/embed_ort_trt_32w.py — but input is ALREADY chunked
(export_legislation_chunks.py) with final id + payload, so this only embeds and upserts.

Each input line: {"id": <uuid>, "text": <chunk>, "payload": {...legal_sections payload...}}

Launch (from Brev host):
  docker run -d --name leg-trt --gpus all --network host -v /data:/data \
    nvcr.io/nvidia/tensorrt:25.05-py3 bash -c \
    'pip install -q onnxruntime-gpu transformers tokenizers qdrant-client && \
     python3 /data/legislation-vectorize/embed_legislation_ort_trt.py \
       --data-dir /data/legislation-vectorize/shards \
       --qdrant-url http://10.88.0.6:6333 --qdrant-api-key <BIGBOX_KEY> \
       --collection legal_sections_bge --num-gpus 8 --batch-size 64'
"""
import argparse, json, logging, os, time
from multiprocessing import Process, Value
from pathlib import Path
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [W%(message)s")
log = logging.getLogger(__name__)

QDRANT_BATCH = 256  # keep request < qdrant 32MB
EMBED_DIM = 1024


def mean_pooling(hidden_state, attention_mask):
    m = np.expand_dims(attention_mask, -1).astype(np.float32)
    return np.sum(hidden_state * m, 1) / np.clip(np.sum(m, 1), 1e-9, None)


def normalize(e):
    return e / np.clip(np.linalg.norm(e, axis=1, keepdims=True), 1e-9, None)


def worker(gpu_id, jsonl_file, qdrant_url, qdrant_api_key, onnx_path, collection, batch_size, progress):
    os.environ["CUDA_VISIBLE_DEVICES"] = str(gpu_id % 8)
    import onnxruntime as ort
    from transformers import AutoTokenizer
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct
    prefix = f"{gpu_id}] "
    tok = AutoTokenizer.from_pretrained("BAAI/bge-m3", cache_dir="/data/hf_cache")
    # CUDA EP only: TensorRT rebuilds an engine per input shape (padding=True => many
    # shapes) which stalls on a 759K-chunk job. CUDA EP handles dynamic shapes with no
    # build step and is plenty fast on H100 for this volume. (TRT worth it only at 100M+ scale.)
    providers = [("CUDAExecutionProvider", {"device_id": 0})]
    sess = ort.InferenceSession(onnx_path, providers=providers)
    log.info(f"{prefix}providers={sess.get_providers()}")
    qc = QdrantClient(url=qdrant_url, api_key=qdrant_api_key or None, timeout=300)

    buf, pending, processed, t0 = [], [], 0, time.time()

    def embed_and_queue():
        if not buf:
            return
        texts = [b["text"] for b in buf]
        enc = tok(texts, padding=True, truncation=True, max_length=512, return_tensors="np")
        ids = enc["input_ids"].astype(np.int64); mask = enc["attention_mask"].astype(np.int64)
        embs = []
        for i in range(0, len(texts), batch_size):
            out = sess.run(None, {"input_ids": ids[i:i+batch_size], "attention_mask": mask[i:i+batch_size]})
            embs.append(normalize(mean_pooling(out[0], mask[i:i+batch_size])))
        embs = np.concatenate(embs, 0)
        for b, e in zip(buf, embs):
            if not np.isfinite(e).all():
                with open("/data/legislation-vectorize/quarantine_nonfinite.jsonl", "a") as qf:
                    qf.write(json.dumps({"id": b["id"]}) + "\n")
                continue
            pending.append(PointStruct(id=b["id"], vector=e.tolist(), payload=b["payload"]))
        buf.clear()

    def flush():
        if not pending:
            return
        for bs in range(0, len(pending), QDRANT_BATCH):
            batch = pending[bs:bs+QDRANT_BATCH]
            for attempt in range(5):
                try:
                    qc.upsert(collection_name=collection, points=batch, wait=False); break
                except Exception as e:  # noqa: BLE001
                    if attempt == 4:
                        with open("/data/legislation-vectorize/failed_upserts.jsonl", "a") as ff:
                            ff.write(json.dumps({"error": str(e)[:200], "ids": [p.id for p in batch]}) + "\n")
                    time.sleep(2 ** attempt)
        pending.clear()

    with open(jsonl_file) as f:
        for line in f:
            d = json.loads(line)
            if not d.get("text") or not d["text"].strip():
                continue
            buf.append(d); processed += 1
            if len(buf) >= 256:
                embed_and_queue()
                with progress.get_lock():
                    progress.value += 256
                if len(pending) >= 8000:
                    flush()
                if processed % 20000 < 256:
                    g = progress.value; el = time.time() - t0; sp = g/el if el else 0
                    log.info(f"{prefix}local={processed} global={g} speed={sp:.0f}/s")
    if buf:
        embed_and_queue()
        with progress.get_lock():
            progress.value += len(buf)
    flush()
    log.info(f"{prefix}DONE {processed}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--qdrant-url", required=True)
    ap.add_argument("--qdrant-api-key", default="")
    ap.add_argument("--onnx-path", default="/data/bge-m3-onnx/model.onnx")
    ap.add_argument("--collection", default="legal_sections_bge")
    ap.add_argument("--num-gpus", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--recreate-collection", action="store_true")
    a = ap.parse_args()

    from qdrant_client import QdrantClient
    from qdrant_client.models import VectorParams, Distance, PayloadSchemaType
    qc = QdrantClient(url=a.qdrant_url, api_key=a.qdrant_api_key or None, timeout=120)
    exists = qc.collection_exists(a.collection)
    if exists and a.recreate_collection:
        qc.delete_collection(a.collection); exists = False
    if not exists:
        qc.create_collection(a.collection, vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
                             on_disk_payload=True)
        for fld, sch in [("document_type", PayloadSchemaType.KEYWORD), ("rada_id", PayloadSchemaType.KEYWORD),
                         ("article_number", PayloadSchemaType.KEYWORD), ("is_current", PayloadSchemaType.BOOL),
                         ("valid_from_ts", PayloadSchemaType.INTEGER), ("valid_to_ts", PayloadSchemaType.INTEGER)]:
            try:
                qc.create_payload_index(a.collection, field_name=fld, field_schema=sch)
            except Exception:
                pass
        log.info(f"created collection {a.collection}")

    shards = sorted(Path(a.data_dir).glob("*.jsonl"))
    log.info(f"shards={len(shards)} -> {a.collection} @ {a.qdrant_url}")
    progress = Value("i", 0)
    procs = []
    for i, sh in enumerate(shards):
        p = Process(target=worker, args=(i % a.num_gpus, str(sh), a.qdrant_url, a.qdrant_api_key,
                                         a.onnx_path, a.collection, a.batch_size, progress))
        p.start(); procs.append(p)
    for p in procs:
        p.join()
    log.info(f"ALL DONE total={progress.value}")


if __name__ == "__main__":
    main()
