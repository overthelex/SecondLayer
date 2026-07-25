#!/usr/bin/env python3
"""Embed the truncated tail of a KAS group: chunk texts already exist in the
payload jsonl beyond the vector count. Reads payloads_gpu0.jsonl[skip:],
embeds the `text` field with ORT+TRT BGE-M3, writes npy + tail payload to disk.
No qdrant — fully decoupled from the applying collection."""
import argparse, json, os, time
import numpy as np

def mean_pooling(hidden, mask):
    m = np.expand_dims(mask, -1).astype(np.float32)
    return np.sum(hidden * m, axis=1) / np.clip(np.sum(m, axis=1), 1e-9, None)

def normalize(e):
    return e / np.clip(np.linalg.norm(e, axis=1, keepdims=True), 1e-9, None)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", type=int, required=True)
    ap.add_argument("--skip", type=int, required=True)       # rows already embedded
    ap.add_argument("--count", type=int, default=0)          # max tail lines to process (0=all)
    ap.add_argument("--gpu", type=int, required=True)
    ap.add_argument("--src-dir", required=True)              # vsplit{g}
    ap.add_argument("--out-dir", required=True)              # tail{g}
    ap.add_argument("--onnx-path", default="/data/bge-m3-ort/model.onnx")
    ap.add_argument("--batch", type=int, default=64)
    args = ap.parse_args()

    os.environ["CUDA_VISIBLE_DEVICES"] = str(args.gpu)
    import onnxruntime as ort
    from transformers import AutoTokenizer

    g = args.group
    os.makedirs(args.out_dir, exist_ok=True)
    log = lambda m: print(f"{time.strftime('%H:%M:%S')} [tail-g{g}] {m}", flush=True)

    tok = AutoTokenizer.from_pretrained("BAAI/bge-m3", cache_dir="/data/hf_cache")
    trt_cache = f"/data/trt_cache_gpu{args.gpu}"  # reuse prebuilt engine
    os.makedirs(trt_cache, exist_ok=True)
    providers = [
        ("TensorrtExecutionProvider", {"device_id": 0, "trt_fp16_enable": True,
            "trt_engine_cache_enable": True, "trt_engine_cache_path": trt_cache}),
        ("CUDAExecutionProvider", {"device_id": 0}),
    ]
    sess = ort.InferenceSession(args.onnx_path, providers=providers)
    log(f"providers: {sess.get_providers()}")

    src_payload = os.path.join(args.src_dir, "payloads_gpu0.jsonl")
    out_payload = open(os.path.join(args.out_dir, "payloads_gpu0.jsonl"), "w")
    emb_buf, all_parts, written, part_no = [], 0, 0, 0
    texts, metas = [], []

    def flush_embed():
        nonlocal texts, metas, emb_buf
        if not texts:
            return
        enc = tok(texts, padding=True, truncation=True, max_length=512, return_tensors="np")
        ids = enc["input_ids"].astype(np.int64); mask = enc["attention_mask"].astype(np.int64)
        out = sess.run(None, {"input_ids": ids, "attention_mask": mask})
        emb_buf.append(normalize(mean_pooling(out[0], mask)).astype(np.float32))
        for m in metas:
            out_payload.write(json.dumps(m) + "\n")
        texts, metas = [], []

    def save_part():
        nonlocal emb_buf, part_no, written
        if not emb_buf:
            return
        merged = np.concatenate(emb_buf, axis=0)
        np.save(os.path.join(args.out_dir, f"embeddings_gpu0_part{part_no}.npy"), merged)
        written += merged.shape[0]; part_no += 1; emb_buf = []
        log(f"saved part{part_no-1}: {merged.shape[0]} (total {written})")

    t0 = time.time()
    end = args.skip + args.count if args.count else None
    with open(src_payload) as f:
        for i, line in enumerate(f):
            if i < args.skip:
                continue
            if end and i >= end:
                break
            m = json.loads(line)
            t = m.get("text", "")
            if not t:
                continue
            texts.append(t); metas.append(m)
            if len(texts) >= args.batch:
                flush_embed()
            if sum(a.shape[0] for a in emb_buf) >= 500000:
                save_part()
    flush_embed(); save_part()
    out_payload.close()
    log(f"DONE: {written} tail embeddings in {(time.time()-t0)/60:.1f}min")

if __name__ == "__main__":
    main()
