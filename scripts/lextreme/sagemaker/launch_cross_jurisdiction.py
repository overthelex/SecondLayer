#!/usr/bin/env python3
"""Launch cross-jurisdiction experiments on SageMaker ml.g5.12xlarge (4x A10G).

Steps:
  1. Upload Ukrainian court decision data to S3
  2. Package training code as tar.gz → S3
  3. Submit SageMaker training job (spot by default)

Usage:
  python launch_cross_jurisdiction.py                    # spot (default, ~60% cheaper)
  python launch_cross_jurisdiction.py --on-demand        # on-demand
  python launch_cross_jurisdiction.py --model xlm-roberta-large  # large model
  python launch_cross_jurisdiction.py --dry-run           # show what would be submitted
"""

import argparse
import os
import sys
import tarfile
import time
from pathlib import Path

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "mlops"))
from spot_wrapper import enable_spot

REGION = "us-west-2"
ROLE = "arn:aws:iam::272594900302:role/SageMakerDPOExecutionRole"
BUCKET = "secondlayer-ml-data-usw2"

IMAGE_URI = "763104351884.dkr.ecr.us-west-2.amazonaws.com/pytorch-training:2.1.0-gpu-py310-cu121-ubuntu20.04-sagemaker"

SCRIPT_DIR = Path(__file__).resolve().parent
TD_CODE_DIR = SCRIPT_DIR / "td-code"
DATA_DIR = SCRIPT_DIR.parent / "output"

CODE_FILES = [
    "train_cross_jurisdiction.py",
    "entry_cross_jurisdiction.py",
    "mlflow_logger.py",
    "mlflow_config.json",
    "requirements.txt",
]

DATA_EPOCHS = ["pre_war", "hybrid_war", "full_scale"]
DATA_SPLITS = ["train", "validation", "test"]


def upload_data(s3, prefix):
    """Upload Ukrainian court decision JSONL files to S3."""
    count = 0
    for epoch in DATA_EPOCHS:
        for split in DATA_SPLITS:
            local_path = DATA_DIR / epoch / f"{split}.jsonl"
            if not local_path.exists():
                print(f"  WARN: {local_path} not found, skipping")
                continue
            s3_key = f"{prefix}/{epoch}/{split}.jsonl"
            size_mb = local_path.stat().st_size / (1024 * 1024)
            print(f"  {epoch}/{split}.jsonl ({size_mb:.1f} MB) -> s3://{BUCKET}/{s3_key}")
            s3.upload_file(str(local_path), BUCKET, s3_key)
            count += 1
    return count


def package_code(tar_path):
    """Create source code tar.gz for SageMaker."""
    with tarfile.open(tar_path, "w:gz") as tar:
        for filename in CODE_FILES:
            filepath = TD_CODE_DIR / filename
            if not filepath.exists():
                print(f"  WARN: {filepath} not found")
                continue
            tar.add(str(filepath), arcname=filename)
            print(f"  + {filename}")

    size_kb = os.path.getsize(tar_path) / 1024
    print(f"  Archive: {tar_path} ({size_kb:.1f} KB)")


def main():
    parser = argparse.ArgumentParser(description="Launch cross-jurisdiction SageMaker job")
    parser.add_argument("--on-demand", action="store_true", help="Use on-demand (default: spot)")
    parser.add_argument("--model", default="xlm-roberta-base",
                        choices=["xlm-roberta-base", "xlm-roberta-large",
                                 "legal-xlm-roberta-base", "legal-xlm-roberta-large"])
    parser.add_argument("--binary-mode", default="drop", choices=["drop", "merge"])
    parser.add_argument("--experiments", default="zero_shot,joint,transfer,reverse",
                        help="Comma-separated experiments to run")
    parser.add_argument("--seeds", default="42,123,456", help="Comma-separated seeds")
    parser.add_argument("--instance", default="ml.g5.12xlarge", help="SageMaker instance type")
    parser.add_argument("--max-runtime", type=int, default=14400, help="Max runtime in seconds")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-data-upload", action="store_true",
                        help="Skip data upload (use if data already on S3)")
    args = parser.parse_args()

    timestamp = int(time.time())
    job_name = f"cross-juris-{args.model.replace('/', '-')}-{timestamp}"
    data_prefix = "cross-jurisdiction/data"
    code_prefix = f"cross-jurisdiction/code/{job_name}"

    print(f"\n=== Cross-Jurisdiction SageMaker Launch ===")
    print(f"  Job:       {job_name}")
    print(f"  Instance:  {args.instance}")
    print(f"  Model:     {args.model}")
    print(f"  Exps:      {args.experiments}")
    print(f"  Seeds:     {args.seeds}")
    print(f"  Binary:    {args.binary_mode}")
    print(f"  Spot:      {not args.on_demand}")
    print()

    s3 = boto3.client("s3", region_name=REGION)

    # 1. Upload data
    if not args.skip_data_upload:
        print("Step 1: Uploading Ukrainian data to S3...")
        n = upload_data(s3, data_prefix)
        print(f"  Uploaded {n} files\n")
    else:
        print("Step 1: Skipping data upload (--skip-data-upload)\n")

    # 2. Package and upload code
    print("Step 2: Packaging code...")
    tar_path = f"/tmp/cross-juris-code-{timestamp}.tar.gz"
    package_code(tar_path)
    code_key = f"{code_prefix}/sourcedir.tar.gz"
    s3.upload_file(tar_path, BUCKET, code_key)
    print(f"  Uploaded to s3://{BUCKET}/{code_key}\n")

    # 3. Build job config
    print("Step 3: Submitting SageMaker job...")

    mlflow_password = os.environ["MLFLOW_TRACKING_PASSWORD"]

    job_config = dict(
        TrainingJobName=job_name,
        RoleArn=ROLE,
        AlgorithmSpecification={
            "TrainingImage": IMAGE_URI,
            "TrainingInputMode": "File",
        },
        HyperParameters={
            "sagemaker_program": "entry_cross_jurisdiction.py",
            "sagemaker_submit_directory": f"s3://{BUCKET}/{code_key}",
            "sagemaker_region": REGION,
            "model": args.model,
            "binary_mode": args.binary_mode,
            "experiments": args.experiments,
            "seeds": args.seeds,
        },
        InputDataConfig=[
            {
                "ChannelName": "data",
                "DataSource": {
                    "S3DataSource": {
                        "S3DataType": "S3Prefix",
                        "S3Uri": f"s3://{BUCKET}/{data_prefix}",
                        "S3DataDistributionType": "FullyReplicated",
                    }
                },
            },
        ],
        OutputDataConfig={
            "S3OutputPath": f"s3://{BUCKET}/cross-jurisdiction/output",
        },
        ResourceConfig={
            "InstanceType": args.instance,
            "InstanceCount": 1,
            "VolumeSizeInGB": 100,
        },
        StoppingCondition={
            "MaxRuntimeInSeconds": args.max_runtime,
        },
        Environment={
            "MLFLOW_TRACKING_PASSWORD": mlflow_password,
            "MLFLOW_TRACKING_USERNAME": "admin",
            "MLFLOW_HARDWARE_TAG": "a10g",
            "MLFLOW_HTTP_REQUEST_TIMEOUT": "10",
        },
        Tags=[
            {"Key": "project", "Value": "secondlayer"},
            {"Key": "experiment", "Value": "cross-jurisdiction"},
            {"Key": "workload", "Value": "ml-training"},
            {"Key": "model", "Value": args.model},
        ],
    )

    if not args.on_demand:
        checkpoint_s3 = f"s3://{BUCKET}/cross-jurisdiction/checkpoints/{job_name}/"
        job_config = enable_spot(job_config, checkpoint_s3=checkpoint_s3)
        print(f"  Spot training enabled (~60% savings)")

    if args.dry_run:
        import json
        print(f"\n  [DRY RUN] Would submit:")
        print(json.dumps(job_config, indent=2, default=str))
        return

    sm = boto3.client("sagemaker", region_name=REGION)
    sm.create_training_job(**job_config)

    print(f"\n  Job launched: {job_name}")
    print(f"\n  Monitor:")
    print(f"    aws sagemaker describe-training-job --training-job-name {job_name} --region {REGION} --query TrainingJobStatus")
    print(f"    aws logs tail /aws/sagemaker/TrainingJobs --log-stream-name-prefix {job_name} --region {REGION} --follow")
    print(f"\n  Output: s3://{BUCKET}/cross-jurisdiction/output/{job_name}/")


if __name__ == "__main__":
    main()
