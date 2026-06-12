#!/usr/bin/env python3
"""
Embed EDRSR docs using ORT+TensorRT FP16 on multi-GPU.
One process per GPU, each reads its own JSONL shard.
Runs inside NGC TensorRT container.
"""
import argparse
import json
import logging
import os
import time
import uuid
import numpy as np
from multiprocessing import Process, Value
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [W%(message)s")
log = logging.getLogger(__name__)

COLLECTION = "edrsr_decisions"
MAX_CHUNK_CHARS = 2048
QDRANT_BATCH = 5000


def chunk_text(text, max_chars=MAX_CHUNK_CHARS):
    if len(text) <= max_chars:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            space_idx = text.rfind(" ", start + max_chars // 2, end)
            if space_idx > 0:
                end = space_idx
        chunks.append(text[start:end])
        start = end
        if len(text) - start < 100:
            break
    return chunks


def mean_pooling(hidden_state, attention_mask):
    mask_expanded = np.expand_dims(attention_mask, axis=-1).astype(np.float32)
    sum_embeddings = np.sum(hidden_state * mask_expanded, axis=1)
    sum_mask = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
    return sum_embeddings / sum_mask


def normalize(embeddings):
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    return embeddings / np.clip(norms, a_min=1e-9, a_max=None)


def worker(gpu_id, jsonl_file, justice_kind, qdrant_url, qdrant_api_key,
           onnx_path, batch_size, progress, total_docs):
    os.environ["CUDA_VISIBLE_DEVICES"] = str(gpu_id)

    import onnxruntime as ort
    from transformers import AutoTokenizer
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct

    prefix = f"{gpu_id}] "

    log.info(f"{prefix}Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-m3", cache_dir="/data/hf_cache")

    log.info(f"{prefix}Creating ORT+TRT session on GPU {gpu_id}...")
    trt_cache = f"/data/trt_cache_gpu{gpu_id}"
    os.makedirs(trt_cache, exist_ok=True)

    providers = [
        ("TensorrtExecutionProvider", {
            "device_id": 0,
            "trt_fp16_enable": True,
            "trt_engine_cache_enable": True,
            "trt_engine_cache_path": trt_cache,
        }),
        ("CUDAExecutionProvider", {"device_id": 0}),
    ]
    sess = ort.InferenceSession(onnx_path, providers=providers)
    active = sess.get_providers()
    log.info(f"{prefix}Active providers: {active}")

    qdrant = QdrantClient(url=qdrant_url, api_key=qdrant_api_key or None, timeout=300)

    processed = 0
    total_chunks = 0
    doc_buffer = []
    pending_points = []
    t0 = time.time()

    def embed_and_queue():
        nonlocal total_chunks
        if not doc_buffer:
            return

        all_chunks = []
        chunk_payloads = []
        for doc in doc_buffer:
            text = doc["text"][:15000]
            chunks = chunk_text(text)
            for ci, chunk in enumerate(chunks):
                all_chunks.append(chunk)
                chunk_payloads.append({
                    "edrsr_doc_id": doc["doc_id"],
                    "court_code": doc.get("court_code", 0),
                    "judge": doc.get("judge", ""),
                    "cause_num": doc.get("cause_num", ""),
                    "justice_kind": justice_kind,
                    "adjudication_date": doc.get("adjudication_date", ""),
                    "judgment_code": doc.get("judgment_code", 0),
                    "category_code": doc.get("category_code", 0),
                    "chunk_index": ci,
                    "total_chunks": len(chunks),
                    "text": chunk,
                    "embedding_model": "bge-m3",
                })

        encoded = tokenizer(
            all_chunks, padding=True, truncation=True,
            max_length=512, return_tensors="np",
        )
        input_ids = encoded["input_ids"].astype(np.int64)
        attention_mask = encoded["attention_mask"].astype(np.int64)

        # Process in sub-batches for ORT
        all_embeddings = []
        for i in range(0, len(all_chunks), batch_size):
            ids_batch = input_ids[i:i + batch_size]
            mask_batch = attention_mask[i:i + batch_size]
            outputs = sess.run(None, {
                "input_ids": ids_batch,
                "attention_mask": mask_batch,
            })
            hidden = outputs[0]
            pooled = mean_pooling(hidden, mask_batch)
            normed = normalize(pooled)
            all_embeddings.append(normed)

        embeddings = np.concatenate(all_embeddings, axis=0)

        for i, (emb, meta) in enumerate(zip(embeddings, chunk_payloads)):
            pending_points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=emb.tolist(),
                payload=meta,
            ))

        total_chunks += len(all_chunks)
        doc_buffer.clear()

    def flush_qdrant():
        if not pending_points:
            return
        for bs in range(0, len(pending_points), QDRANT_BATCH):
            batch = pending_points[bs:bs + QDRANT_BATCH]
            for attempt in range(5):
                try:
                    qdrant.upsert(collection_name=COLLECTION, points=batch, wait=False)
                    break
                except Exception as e:
                    if attempt == 4:
                        log.error(f"{prefix}Qdrant failed after 5 attempts: {e}")
                    time.sleep(2 ** attempt)
        pending_points.clear()

    with open(jsonl_file) as f:
        for line in f:
            doc = json.loads(line)
            if not doc.get("text") or len(doc["text"]) < 50:
                continue
            doc_buffer.append(doc)
            processed += 1

            if len(doc_buffer) >= 200:
                embed_and_queue()
                with progress.get_lock():
                    progress.value += 200

                if len(pending_points) >= 20000:
                    flush_qdrant()

                if processed % 4000 < 200:
                    g = progress.value
                    elapsed = time.time() - t0
                    speed = g / elapsed if elapsed > 0 else 0
                    eta = (total_docs - g) / speed if speed > 0 else 0
                    log.info(f"{prefix}local={processed} global={g}/{total_docs} ({100*g/total_docs:.1f}%) "
                             f"chunks={total_chunks} speed={speed:.0f} docs/s ETA={eta/3600:.1f}h")

    if doc_buffer:
        embed_and_queue()
        with progress.get_lock():
            progress.value += len(doc_buffer)
    flush_qdrant()

    log.info(f"{prefix}Done: {processed} docs, {total_chunks} chunks")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--justice-kind", type=int, required=True)
    parser.add_argument("--qdrant-url", required=True)
    parser.add_argument("--qdrant-api-key", default="")
    parser.add_argument("--onnx-path", default="/data/bge-m3-onnx/model.onnx")
    parser.add_argument("--num-gpus", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    jsonl_files = sorted(Path(args.data_dir).glob("*.jsonl"))
    log.info(f"Found {len(jsonl_files)} JSONL files")

    import subprocess
    result = subprocess.run(
        ["wc", "-l"] + [str(f) for f in jsonl_files],
        capture_output=True, text=True,
    )
    counts = []
    for line in result.stdout.strip().split("\n")[:-1]:
        counts.append(int(line.strip().split()[0]))
    total_docs = sum(counts)
    log.info(f"Total docs: {total_docs} (per file: {counts})")

    progress = Value("i", 0)
    workers = []

    for i, jf in enumerate(jsonl_files[:args.num_gpus]):
        p = Process(target=worker, args=(
            i, str(jf), args.justice_kind, args.qdrant_url, args.qdrant_api_key,
            args.onnx_path, args.batch_size, progress, total_docs,
        ))
        p.start()
        workers.append(p)

    for p in workers:
        p.join()

    log.info(f"All done! {progress.value} docs")


if __name__ == "__main__":
    main()
