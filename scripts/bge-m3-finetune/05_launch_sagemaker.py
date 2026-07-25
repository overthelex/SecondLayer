#!/usr/bin/env python3
"""Launch BGE-M3 fine-tuning on SageMaker.

Uploads training data + scripts to S3, launches training job.

Usage:
    # Stage 1 (contrastive, ~2h on g5.2xlarge):
    python 05_launch_sagemaker.py --stage 1 --train-data stage1_citation_pairs.jsonl

    # Stage 2 (supervised + distillation, ~1h on g5.2xlarge):
    python 05_launch_sagemaker.py --stage 2 --train-data stage2_supervised.jsonl \
        --resume-from s3://secondlayer-ml-data-usw2/bge-m3-finetune/stage1/

    # With spot instances (60-70% cheaper):
    python 05_launch_sagemaker.py --stage 1 --train-data stage1_citation_pairs.jsonl --spot
"""

import argparse
import boto3
import os
import sys
import tarfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mlops"))
from spot_wrapper import enable_spot

REGION = "us-west-2"
ROLE = "arn:aws:iam::272594900302:role/SageMakerDPOExecutionRole"
BUCKET = "secondlayer-ml-data-usw2"
IMAGE_URI = "763104351884.dkr.ecr.us-west-2.amazonaws.com/pytorch-training:2.5.1-gpu-py311-cu124-ubuntu22.04-sagemaker"

STAGE_HYPERPARAMS = {
    # lr lowered 5e-5 -> 1e-5 / 1e-5 -> 5e-6, batch 2 -> 4; bf16 is the entry
    # default now. First run (fp16 + temp 0.02 + lr 5e-5) collapsed the encoder
    # to a constant vector: loss flat at ln(16) / ln(8) = uniform scores.
    1: {
        "stage": "1",
        "learning_rate": "1e-5",
        "num_train_epochs": "1",
        "per_device_train_batch_size": "4",
        "warmup_ratio": "0.1",
        "query_max_len": "256",
        "passage_max_len": "512",
        "unified_finetuning": "False",
        "use_self_distill": "False",
    },
    2: {
        "stage": "2",
        "learning_rate": "5e-6",
        "num_train_epochs": "3",
        "per_device_train_batch_size": "4",
        "warmup_ratio": "0.05",
        "query_max_len": "256",
        "passage_max_len": "512",
        "unified_finetuning": "True",
        "use_self_distill": "True",
        "self_distill_start_step": "500",
    },
}


def main():
    parser = argparse.ArgumentParser(description="Launch BGE-M3 fine-tuning on SageMaker")
    parser.add_argument("--stage", type=int, required=True, choices=[1, 2])
    parser.add_argument("--train-data", required=True, help="Local path to training JSONL")
    parser.add_argument("--resume-from", help="S3 URI of Stage 1 model output (for Stage 2)")
    parser.add_argument("--instance-type", default="ml.g5.2xlarge")
    parser.add_argument("--spot", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    timestamp = int(time.time())
    job_name = f"bge-m3-ft-stage{args.stage}-{timestamp}"
    s3_prefix = f"bge-m3-finetune/stage{args.stage}/{job_name}"

    s3 = boto3.client("s3", region_name=REGION)
    sm = boto3.client("sagemaker", region_name=REGION)

    # Upload training data
    print(f"Uploading training data to S3...")
    data_key = f"{s3_prefix}/train_data/train.jsonl"
    s3.upload_file(args.train_data, BUCKET, data_key)
    print(f"  s3://{BUCKET}/{data_key}")

    # Package source code
    script_dir = os.path.dirname(os.path.abspath(__file__))
    tar_path = f"/tmp/bge-m3-ft-source-{timestamp}.tar.gz"

    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(os.path.join(script_dir, "sagemaker_entry.py"), arcname="sagemaker_entry.py")
        tar.add(os.path.join(script_dir, "train_wrapper.py"), arcname="train_wrapper.py")
        tar.add(os.path.join(script_dir, "requirements.txt"), arcname="requirements.txt")

    code_key = f"{s3_prefix}/sourcedir.tar.gz"
    s3.upload_file(tar_path, BUCKET, code_key)
    print(f"  s3://{BUCKET}/{code_key}")
    os.remove(tar_path)

    # Build job config
    hyperparams = {
        **STAGE_HYPERPARAMS[args.stage],
        "sagemaker_program": "sagemaker_entry.py",
        "sagemaker_submit_directory": f"s3://{BUCKET}/{code_key}",
        "sagemaker_region": REGION,
    }

    input_channels = [
        {
            "ChannelName": "training",
            "DataSource": {
                "S3DataSource": {
                    "S3DataType": "S3Prefix",
                    "S3Uri": f"s3://{BUCKET}/{s3_prefix}/train_data/",
                    "S3DataDistributionType": "FullyReplicated",
                }
            },
        },
    ]

    if args.resume_from:
        # delivered as model.tar.gz; sagemaker_entry extracts it
        input_channels.append({
            "ChannelName": "model",
            "DataSource": {
                "S3DataSource": {
                    "S3DataType": "S3Prefix",
                    "S3Uri": args.resume_from,
                    "S3DataDistributionType": "FullyReplicated",
                }
            },
        })

    # MLflow credentials from env
    mlflow_user = os.environ.get("MLFLOW_TRACKING_USERNAME", "sagemaker")
    mlflow_pass = os.environ.get("MLFLOW_TRACKING_PASSWORD", "")
    if not mlflow_pass:
        print("WARNING: MLFLOW_TRACKING_PASSWORD not set, MLflow logging will fail")

    job_config = dict(
        TrainingJobName=job_name,
        RoleArn=ROLE,
        AlgorithmSpecification={
            "TrainingImage": IMAGE_URI,
            "TrainingInputMode": "File",
        },
        HyperParameters=hyperparams,
        InputDataConfig=input_channels,
        OutputDataConfig={
            "S3OutputPath": f"s3://{BUCKET}/bge-m3-finetune/output/",
        },
        ResourceConfig={
            "InstanceType": args.instance_type,
            "InstanceCount": 1,
            "VolumeSizeInGB": 200,
        },
        StoppingCondition={
            "MaxRuntimeInSeconds": 50400,  # 14 hours
        },
        Environment={
            "MLFLOW_TRACKING_URI": "http://35.84.222.41:5000",
            "MLFLOW_TRACKING_USERNAME": mlflow_user,
            "MLFLOW_TRACKING_PASSWORD": mlflow_pass,
        },
        Tags=[
            {"Key": "project", "Value": "secondlayer"},
            {"Key": "experiment", "Value": f"bge-m3-finetune-stage{args.stage}"},
            {"Key": "workload", "Value": "ml-training"},
        ],
    )

    if args.spot:
        job_config = enable_spot(
            job_config,
            checkpoint_s3=f"s3://{BUCKET}/bge-m3-finetune/checkpoints/{job_name}/",
        )
        print("Spot training enabled (~60-70% savings)")

    if args.dry_run:
        print(f"\nDRY RUN — job config:")
        import json
        print(json.dumps(job_config, indent=2, default=str))
        return

    response = sm.create_training_job(**job_config)
    print(f"\nJob launched: {job_name}")
    print(f"Instance: {args.instance_type}")
    print(f"Monitor:")
    print(f"  aws sagemaker describe-training-job --training-job-name {job_name} --region {REGION} --query TrainingJobStatus")
    print(f"  aws sagemaker describe-training-job --training-job-name {job_name} --region {REGION} --query 'SecondaryStatusTransitions[-1]'")


if __name__ == "__main__":
    main()
