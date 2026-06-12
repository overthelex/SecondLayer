#!/usr/bin/env python3
"""
Launch one atomic embedding job (1 job = 1 model) on SageMaker for the
citation-grounded eval pool (PAPER-48). Hybrid plan: 560M-class models run
here, Qwen3-Embedding-8B stays on Brev.

Prereqs:
  export MLFLOW_TRACKING_USERNAME=sagemaker MLFLOW_TRACKING_PASSWORD=...
  python3 16_launch_embed_sagemaker.py --upload-corpus        # once, 2.7 GB

Jobs (quota: 1 on-demand + 1 spot per instance type -> J1/J2 in parallel):
  J1: python3 16_launch_embed_sagemaker.py --model bge-m3 --spot
  J2: python3 16_launch_embed_sagemaker.py --model me5
  J3: finetune via ../bge-m3-finetune/05_launch_sagemaker.py (g5.2xlarge, other quota)
  J4: python3 16_launch_embed_sagemaker.py --model bge-m3-ua \
        --model-s3 s3://secondlayer-ml-data-usw2/bge-m3-finetune/output/<job>/output/model.tar.gz

Monitor via MLflow (experiment 'citation-embedding-eval'), not log parsing.
Embeddings land in s3://secondlayer-ml-data-usw2/citation-eval/embeddings/<slug>/
as one parquet per corpus shard (spot-safe resume via existing-key skip).
"""

import argparse
import os
import sys
import tarfile
import time
from pathlib import Path

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mlops"))
from spot_wrapper import enable_spot

REGION = "us-west-2"
ROLE = "arn:aws:iam::272594900302:role/SageMakerDPOExecutionRole"
BUCKET = "secondlayer-ml-data-usw2"
# torch>=2.6 base: lifts the transformers>=4.50 torch.load(.bin) restriction
# (CVE-2025-32434), so we can run a patched transformers (ReDoS/Trainer fixes).
IMAGE_URI = "763104351884.dkr.ecr.us-west-2.amazonaws.com/pytorch-training:2.8.0-gpu-py312-cu129-ubuntu22.04-sagemaker"

VARIANTS = {
    # corpus variant -> (local dir name, s3 prefix suffix)
    "stripped": "texts_pool",
    "raw": "texts_pool_raw",   # no-strip leak ablation
}

MODELS = {
    "bge-m3": {
        "model_id": "BAAI/bge-m3",
        "pooling": "cls",
        "doc_prefix": "",
        "max_len": 1024,    # supports 8192; 1024 = benchmark chunk size
    },
    "me5": {
        "model_id": "intfloat/multilingual-e5-large-instruct",
        "pooling": "mean",
        "doc_prefix": "",   # instruct variant: documents need no prefix
        "max_len": 512,     # XLM-R position limit (514) - 1024 hits device assert
    },
    "bge-m3-ua": {
        "model_id": "BAAI/bge-m3",   # tokenizer/base arch; weights via --model-s3
        "pooling": "cls",
        "doc_prefix": "",
        "max_len": 1024,
    },
}


def upload_corpus(s3, variant):
    local = Path(__file__).parent / "output" / "eval500k" / VARIANTS[variant]
    prefix = f"citation-eval/{VARIANTS[variant]}"
    shards = sorted(local.glob("*.jsonl"))
    if not shards:
        raise SystemExit(f"no shards in {local} - run 14_build_relevant_pool.py first")
    existing = set()
    for page in s3.get_paginator("list_objects_v2").paginate(
            Bucket=BUCKET, Prefix=prefix + "/"):
        existing.update(o["Key"] for o in page.get("Contents", []))
    todo = [p for p in shards if f"{prefix}/{p.name}" not in existing]
    print(f"uploading {len(todo)}/{len(shards)} shards to s3://{BUCKET}/{prefix}/")
    for i, p in enumerate(todo, 1):
        s3.upload_file(str(p), BUCKET, f"{prefix}/{p.name}")
        print(f"  [{i}/{len(todo)}] {p.name}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", choices=sorted(MODELS))
    ap.add_argument("--model-s3", help="model.tar.gz S3 URI for finetuned checkpoint")
    ap.add_argument("--instance-type", default="ml.g5.12xlarge")
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--max-len", type=int, default=None,
                    help="override model preset chunk size")
    ap.add_argument("--stride", type=int, default=128)
    ap.add_argument("--spot", action="store_true")
    ap.add_argument("--variant", choices=sorted(VARIANTS), default="stripped",
                    help="corpus variant: stripped (main) or raw (leak ablation)")
    ap.add_argument("--max-runtime-hours", type=float, default=8)
    ap.add_argument("--upload-corpus", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    s3 = boto3.client("s3", region_name=REGION)
    if args.upload_corpus:
        upload_corpus(s3, args.variant)
        if not args.model:
            return
    if not args.model:
        raise SystemExit("--model required (or --upload-corpus alone)")
    if args.model == "bge-m3-ua" and not args.model_s3:
        raise SystemExit("bge-m3-ua requires --model-s3 (finetuned model.tar.gz)")

    cfg = MODELS[args.model]
    max_len = args.max_len or cfg["max_len"]
    ts = int(time.time())
    slug = args.model if args.variant == "stripped" else f"{args.model}-{args.variant}"
    job_name = f"embed-{slug}-{ts}"
    output_s3 = f"s3://{BUCKET}/citation-eval/embeddings/{slug}"

    script_dir = Path(__file__).parent
    code_key = f"citation-eval/code/{job_name}/sourcedir.tar.gz"
    if not args.dry_run:
        tar_path = f"/tmp/embed-source-{ts}.tar.gz"
        with tarfile.open(tar_path, "w:gz") as tar:
            tar.add(script_dir / "embed_entry.py", arcname="embed_entry.py")
            tar.add(script_dir / "requirements_embed.txt", arcname="requirements.txt")
        s3.upload_file(tar_path, BUCKET, code_key)
        os.remove(tar_path)

    hyperparams = {
        "model_id": cfg["model_id"],
        "model_slug": slug,
        "pooling": cfg["pooling"],
        # SageMaker rejects empty hyperparameter values - omit when blank
        **({"doc_prefix": cfg["doc_prefix"]} if cfg["doc_prefix"] else {}),
        "max_len": str(max_len),
        "stride": str(args.stride),
        "batch_size": str(args.batch_size),
        "output_s3": output_s3,
        "sagemaker_program": "embed_entry.py",
        "sagemaker_submit_directory": f"s3://{BUCKET}/{code_key}",
        "sagemaker_region": REGION,
    }

    channels = [{
        "ChannelName": "corpus",
        "DataSource": {"S3DataSource": {
            "S3DataType": "S3Prefix",
            "S3Uri": f"s3://{BUCKET}/citation-eval/{VARIANTS[args.variant]}/",
            "S3DataDistributionType": "FullyReplicated",
        }},
    }]
    if args.model_s3:
        channels.append({
            "ChannelName": "model",
            "DataSource": {"S3DataSource": {
                "S3DataType": "S3Prefix",
                "S3Uri": args.model_s3,
                "S3DataDistributionType": "FullyReplicated",
            }},
        })

    mlflow_user = os.environ.get("MLFLOW_TRACKING_USERNAME", "sagemaker")
    mlflow_pass = os.environ.get("MLFLOW_TRACKING_PASSWORD", "")
    if not mlflow_pass:
        print("WARNING: MLFLOW_TRACKING_PASSWORD not set, MLflow logging will fail")

    job_config = dict(
        TrainingJobName=job_name,
        RoleArn=ROLE,
        AlgorithmSpecification={"TrainingImage": IMAGE_URI, "TrainingInputMode": "File"},
        HyperParameters=hyperparams,
        InputDataConfig=channels,
        OutputDataConfig={"S3OutputPath": f"s3://{BUCKET}/citation-eval/job-output/"},
        ResourceConfig={
            "InstanceType": args.instance_type,
            "InstanceCount": 1,
            "VolumeSizeInGB": 100,
        },
        StoppingCondition={"MaxRuntimeInSeconds": int(args.max_runtime_hours * 3600)},
        Environment={
            "MLFLOW_TRACKING_URI": "https://mlflow.legal.org.ua",
            "MLFLOW_TRACKING_USERNAME": mlflow_user,
            "MLFLOW_TRACKING_PASSWORD": mlflow_pass,
        },
        Tags=[
            {"Key": "project", "Value": "secondlayer"},
            {"Key": "experiment", "Value": "citation-embedding-eval"},
            {"Key": "workload", "Value": "ml-embedding"},
        ],
    )

    if args.spot:
        job_config = enable_spot(
            job_config,
            checkpoint_s3=f"s3://{BUCKET}/citation-eval/checkpoints/{job_name}/",
        )
        print("Spot enabled (resume = skip existing parquet keys)")

    if args.dry_run:
        import json
        print(json.dumps(job_config, indent=2, default=str))
        return

    boto3.client("sagemaker", region_name=REGION).create_training_job(**job_config)
    print(f"\nLaunched: {job_name} on {args.instance_type}")
    print(f"Embeddings -> {output_s3}/")
    print(f"MLflow: experiment 'citation-embedding-eval', run 'embed-{slug}'")


if __name__ == "__main__":
    main()
