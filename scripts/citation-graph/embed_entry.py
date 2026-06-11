#!/usr/bin/env python3
"""
SageMaker entry: embed the EVAL pool corpus with one HF encoder model.

One job = one model (atomic). Reads jsonl shards from the 'corpus' channel,
chunks each doc (max_len tokens with stride overlap), embeds on every visible
GPU (one worker process per GPU, shards split round-robin), mean-pools chunk
vectors into a doc vector, writes one parquet per input shard directly to S3.

Spot-safe: a shard whose parquet already exists in S3 is skipped, so a
restarted job resumes where it stopped.

MLflow: experiment 'citation-embedding-eval', params + throughput metrics
logged from the master process every 60s and at completion.
"""

import argparse
import json
import multiprocessing as mp
import os
import time
from pathlib import Path

import boto3

CORPUS_DIR = Path(os.environ.get("SM_CHANNEL_CORPUS", "/opt/ml/input/data/corpus"))
WORK_DIR = Path("/tmp/embed_out")


def resolve_model_dir():
    """Channel 'model' may hold an unextracted model.tar.gz - extract once."""
    chan = os.environ.get("SM_CHANNEL_MODEL")
    if not chan:
        return None
    import tarfile
    chan = Path(chan)
    tars = list(chan.glob("*.tar.gz"))
    if tars:
        dest = Path("/tmp/finetuned_model")
        if not dest.exists():
            dest.mkdir(parents=True)
            with tarfile.open(tars[0]) as t:
                t.extractall(dest)
        # checkpoint may be nested one level down
        if not (dest / "config.json").exists():
            sub = [p for p in dest.iterdir() if (p / "config.json").exists()]
            if sub:
                dest = sub[0]
        return str(dest)
    return str(chan)


MODEL_DIR = resolve_model_dir()


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model_id", required=True)
    ap.add_argument("--model_slug", required=True, help="short name for paths/MLflow")
    ap.add_argument("--pooling", choices=["cls", "mean"], default="cls")
    ap.add_argument("--max_len", type=int, default=1024)
    ap.add_argument("--stride", type=int, default=128, help="token overlap between chunks")
    ap.add_argument("--batch_size", type=int, default=64)
    ap.add_argument("--doc_prefix", default="", help="e.g. 'passage: ' for non-instruct e5")
    ap.add_argument("--output_s3", required=True, help="s3://bucket/prefix for parquet shards")
    # injected by SageMaker, ignored
    ap.add_argument("--sagemaker_program", default=None)
    ap.add_argument("--sagemaker_submit_directory", default=None)
    ap.add_argument("--sagemaker_region", default=None)
    args, _ = ap.parse_known_args()
    return args


def s3_parts(uri):
    rest = uri[len("s3://"):]
    bucket, _, prefix = rest.partition("/")
    return bucket, prefix.rstrip("/")


def shard_done_key(prefix, shard_name):
    return f"{prefix}/{shard_name.replace('.jsonl', '.parquet')}"


def worker(rank, args, shard_files, progress):
    import pyarrow as pa
    import pyarrow.parquet as pq
    import torch
    from transformers import AutoModel, AutoTokenizer

    torch.set_grad_enabled(False)
    device = f"cuda:{rank}"
    model_path = MODEL_DIR if MODEL_DIR else args.model_id
    tok = AutoTokenizer.from_pretrained(model_path)
    model = AutoModel.from_pretrained(model_path, torch_dtype=torch.float16).to(device).eval()

    bucket, prefix = s3_parts(args.output_s3)
    s3 = boto3.client("s3")
    my_shards = shard_files[rank::torch.cuda.device_count()]

    for shard in my_shards:
        out_key = shard_done_key(prefix, shard.name)
        try:
            s3.head_object(Bucket=bucket, Key=out_key)
            print(f"[{rank}] skip {shard.name} (exists)")
            continue
        except s3.exceptions.ClientError:
            pass

        doc_ids, vectors, chunk_counts = [], [], []
        pending = []  # (doc_idx, input_ids, attention_mask) per chunk

        def embed_pending():
            embs = []
            for i in range(0, len(pending), args.batch_size):
                batch = pending[i:i + args.batch_size]
                maxlen = max(len(b[1]) for b in batch)
                ids = torch.full((len(batch), maxlen), tok.pad_token_id, dtype=torch.long)
                mask = torch.zeros((len(batch), maxlen), dtype=torch.long)
                for j, (_, bi, bm) in enumerate(batch):
                    ids[j, :len(bi)] = torch.tensor(bi)
                    mask[j, :len(bm)] = torch.tensor(bm)
                out = model(input_ids=ids.to(device), attention_mask=mask.to(device))
                h = out.last_hidden_state
                if args.pooling == "cls":
                    e = h[:, 0]
                else:
                    m = mask.to(device).unsqueeze(-1)
                    e = (h * m).sum(1) / m.sum(1).clamp(min=1)
                e = torch.nn.functional.normalize(e, dim=-1)
                embs.append(e.float().cpu())
            return torch.cat(embs) if embs else torch.empty(0)

        docs = []
        with open(shard, encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                docs.append((d["doc_id"], d["text"]))

        for doc_idx, (doc_id, text) in enumerate(docs):
            enc = tok(args.doc_prefix + text, max_length=args.max_len,
                      truncation=True, stride=args.stride,
                      return_overflowing_tokens=True, padding=False)
            for ids_, mask_ in zip(enc["input_ids"], enc["attention_mask"]):
                pending.append((doc_idx, ids_, mask_))

        chunk_embs = embed_pending()
        owners = torch.tensor([p[0] for p in pending])
        for doc_idx, (doc_id, _) in enumerate(docs):
            sel = chunk_embs[owners == doc_idx]
            if not len(sel):
                continue
            v = torch.nn.functional.normalize(sel.mean(0), dim=-1)
            doc_ids.append(doc_id)
            vectors.append(v.numpy())
            chunk_counts.append(len(sel))

        WORK_DIR.mkdir(parents=True, exist_ok=True)
        local = WORK_DIR / f"{rank}.parquet"
        pq.write_table(pa.table({
            "doc_id": pa.array(doc_ids, pa.int64()),
            "vector": pa.array([v.tolist() for v in vectors], pa.list_(pa.float32())),
            "n_chunks": pa.array(chunk_counts, pa.int32()),
        }), local)
        s3.upload_file(str(local), bucket, out_key)
        with progress.get_lock():
            progress[0] += len(doc_ids)
            progress[1] += sum(chunk_counts)
            progress[2] += 1
        print(f"[{rank}] {shard.name}: {len(doc_ids)} docs, {sum(chunk_counts)} chunks")


def main():
    args = parse_args()
    import torch
    n_gpu = torch.cuda.device_count()
    shard_files = sorted(CORPUS_DIR.glob("*.jsonl"))
    print(f"corpus: {len(shard_files)} shards, GPUs: {n_gpu}")

    import mlflow
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "https://mlflow.legal.org.ua"))
    mlflow.set_experiment("citation-embedding-eval")
    run = mlflow.start_run(run_name=f"embed-{args.model_slug}")
    mlflow.log_params({
        "model_id": args.model_id, "model_slug": args.model_slug,
        "pooling": args.pooling, "max_len": args.max_len, "stride": args.stride,
        "batch_size": args.batch_size, "doc_prefix": args.doc_prefix or "(none)",
        "n_shards": len(shard_files), "n_gpus": n_gpu,
        "finetuned_checkpoint": bool(MODEL_DIR),
        "instance_type": os.environ.get("SM_CURRENT_INSTANCE_TYPE", "?"),
        "output_s3": args.output_s3,
    })

    progress = mp.Array("l", [0, 0, 0])  # docs, chunks, shards
    t0 = time.time()
    ctx = mp.get_context("spawn")
    procs = [ctx.Process(target=worker, args=(r, args, shard_files, progress))
             for r in range(n_gpu)]
    for p in procs:
        p.start()

    while any(p.is_alive() for p in procs):
        time.sleep(60)
        el = time.time() - t0
        docs, chunks, shards = progress[0], progress[1], progress[2]
        mlflow.log_metrics({
            "docs_done": docs, "chunks_done": chunks, "shards_done": shards,
            "docs_per_sec": round(docs / el, 2), "chunks_per_sec": round(chunks / el, 2),
        }, step=int(el))
        print(f"[master] {el:.0f}s: {shards}/{len(shard_files)} shards, "
              f"{docs} docs, {docs / el:.1f} docs/s")

    failed = [p.exitcode for p in procs if p.exitcode]
    el = time.time() - t0
    mlflow.log_metrics({
        "total_docs": progress[0], "total_chunks": progress[1],
        "wall_seconds": round(el), "final_docs_per_sec": round(progress[0] / el, 2),
    })
    mlflow.end_run("FAILED" if failed else "FINISHED")
    if failed:
        raise SystemExit(f"worker(s) failed: {failed}")
    # token success marker for the model artifact path
    Path("/opt/ml/model/DONE").write_text(json.dumps({
        "docs": progress[0], "chunks": progress[1], "seconds": round(el)}))
    print(f"DONE: {progress[0]} docs, {progress[1]} chunks in {el:.0f}s")


if __name__ == "__main__":
    main()
