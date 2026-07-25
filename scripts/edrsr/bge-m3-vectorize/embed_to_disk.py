#!/usr/bin/env python3
"""
Phase 1: Embed ГПК docs from JSONL → save vectors+payloads to disk.
No network dependencies. Pure GPU compute.

Output: /home/nvidia/hpk_vectors/shard_XX.npz (vectors) + shard_XX.jsonl (payloads)
"""

import argparse
import json
import logging
import os
import time
import uuid
from multiprocessing import Process, Value
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [W%(message)s")
log = logging.getLogger(__name__)

MODEL_ID = "BAAI/bge-m3"
JUSTICE_KIND = 3
MAX_CHUNK_CHARS = 2048


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


def worker(gpu_id, jsonl_file, output_dir, batch_size, progress, total_docs):
    import torch
    from sentence_transformers import SentenceTransformer

    prefix = f"{gpu_id}] "
    device = f"cuda:{gpu_id}"

    log.info(f"{prefix}Loading model on {device}...")
    model = SentenceTransformer(MODEL_ID, device=device, trust_remote_code=True)
    log.info(f"{prefix}Model loaded")

    out_vectors = os.path.join(output_dir, f"shard_{gpu_id:02d}.npy")
    out_payloads = os.path.join(output_dir, f"shard_{gpu_id:02d}.jsonl")

    all_vectors = []
    processed = 0
    total_chunks = 0
    doc_buffer = []
    t0 = time.time()
    flush_count = 0

    def flush_buffer():
        nonlocal total_chunks, flush_count
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
                    "justice_kind": JUSTICE_KIND,
                    "adjudication_date": doc.get("adjudication_date", ""),
                    "judgment_code": doc.get("judgment_code", 0),
                    "category_code": doc.get("category_code", 0),
                    "chunk_index": ci,
                    "total_chunks": len(chunks),
                    "text": chunk,
                })

        embeddings = model.encode(
            all_chunks, batch_size=batch_size,
            normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False,
        )

        all_vectors.append(embeddings)

        with open(out_payloads, "a") as f:
            for p in chunk_payloads:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")

        total_chunks += len(all_chunks)
        doc_buffer.clear()
        flush_count += 1

        # Save vectors periodically (every 50 flushes = 10K docs)
        if flush_count % 50 == 0:
            merged = np.concatenate(all_vectors, axis=0)
            np.save(out_vectors, merged)

    with open(jsonl_file) as f:
        for line in f:
            doc = json.loads(line)
            if not doc.get("text") or len(doc["text"]) < 50:
                continue
            doc_buffer.append(doc)
            processed += 1

            if len(doc_buffer) >= 200:
                flush_buffer()
                with progress.get_lock():
                    progress.value += 200

                if processed % 4000 < 200:
                    g = progress.value
                    elapsed = time.time() - t0
                    speed = g / elapsed if elapsed > 0 else 0
                    eta = (total_docs - g) / speed if speed > 0 else 0
                    log.info(f"{prefix}local={processed} global={g}/{total_docs} ({100*g/total_docs:.1f}%) "
                             f"chunks={total_chunks} speed={speed:.0f} docs/s ETA={eta/3600:.1f}h")

    # Final flush
    if doc_buffer:
        flush_buffer()
        with progress.get_lock():
            progress.value += len(doc_buffer)

    # Save final vectors
    merged = np.concatenate(all_vectors, axis=0)
    np.save(out_vectors, merged)
    log.info(f"{prefix}Done: {processed} docs, {total_chunks} chunks, vectors shape={merged.shape}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output-dir", default="/home/nvidia/hpk_vectors")
    parser.add_argument("--num-gpus", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    jsonl_files = sorted(Path(args.data_dir).glob("*.jsonl"))
    log.info(f"Found {len(jsonl_files)} JSONL files")

    total_docs = 0
    for f in jsonl_files:
        with open(f) as fh:
            total_docs += sum(1 for _ in fh)
    log.info(f"Total docs: {total_docs}")

    progress = Value("i", 0)
    workers = []
    t0 = time.time()

    for i, jf in enumerate(jsonl_files[:args.num_gpus]):
        p = Process(target=worker, args=(i, str(jf), args.output_dir, args.batch_size, progress, total_docs))
        p.start()
        workers.append(p)

    for p in workers:
        p.join()

    elapsed = time.time() - t0
    log.info(f"\nEmbedding done! {progress.value} docs in {elapsed:.0f}s ({progress.value/elapsed:.0f} docs/s)")
    log.info(f"Vectors saved to {args.output_dir}")


if __name__ == "__main__":
    main()
