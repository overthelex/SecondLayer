"""
Launch full DPO experiment on SageMaker.
Runs 4 conditions × 3 seeds = 9 training jobs (Condition D = no training).

Usage:
  pip install sagemaker boto3
  python launch_experiment.py [--dry-run] [--condition a] [--seed 42]
"""

import argparse
import json
import time
from pathlib import Path

import boto3
import sagemaker
from sagemaker.huggingface import HuggingFace

BUCKET = "secondlayer-rlhf-exp4"
REGION = "us-west-2"
ROLE_ARN = None  # Set after IAM setup, or auto-detect

CONDITIONS = {
    "a": {
        "name": "practitioner-oversight",
        "train_prefix": "data/condition_a",
        "description": "Practitioner edit-trace DPO (24,495 pairs)",
    },
    "c": {
        "name": "rlaif-self-correction",
        "train_prefix": "data/condition_c",
        "description": "RLAIF Claude Haiku 4.5 self-correction (24,495 pairs)",
    },
    "e": {
        "name": "public-rlhf-ultrafeedback",
        "train_prefix": "data/condition_e",
        "description": "UltraFeedback public RLHF (24,495 sampled pairs)",
    },
}

SEEDS = [42, 123, 456]

HYPERPARAMETERS = {
    "model_name_or_path": "meta-llama/Llama-3.1-8B-Instruct",
    "num_train_epochs": "1",
    "per_device_train_batch_size": "2",
    "gradient_accumulation_steps": "4",
    "learning_rate": "5e-5",
    "beta": "0.1",
    "max_length": "1024",
    "max_prompt_length": "512",
    "lora_r": "16",
    "lora_alpha": "32",
    "lora_dropout": "0.05",
}


def upload_data(s3_client, local_dir: Path, condition: str):
    """Upload train/val JSONL to S3 for a condition."""
    prefix = CONDITIONS[condition]["train_prefix"]

    for filename in ["train.jsonl", "val.jsonl"]:
        local_path = local_dir / filename
        if not local_path.exists():
            print(f"  WARNING: {local_path} not found, skipping")
            continue
        s3_key = f"{prefix}/{filename}"
        print(f"  Uploading {local_path} -> s3://{BUCKET}/{s3_key}")
        s3_client.upload_file(str(local_path), BUCKET, s3_key)


def launch_training_job(condition: str, seed: int, role: str, dry_run: bool = False):
    """Launch one SageMaker training job."""
    cond_info = CONDITIONS[condition]
    job_name = f"dpo-{cond_info['name']}-seed{seed}-{int(time.time())}"
    s3_train = f"s3://{BUCKET}/{cond_info['train_prefix']}"
    s3_output = f"s3://{BUCKET}/output/{cond_info['name']}/seed{seed}/"

    hp = {
        **HYPERPARAMETERS,
        "condition": condition,
        "seed": str(seed),
        "dataset_path": "/opt/ml/input/data/training",
        "output_dir": "/opt/ml/model",
    }

    print(f"\n{'='*60}")
    print(f"Job: {job_name}")
    print(f"Condition {condition.upper()}: {cond_info['description']}")
    print(f"Seed: {seed}")
    print(f"Data: {s3_train}")
    print(f"Output: {s3_output}")

    if dry_run:
        print("  [DRY RUN] Would launch SageMaker training job")
        print(f"  Hyperparameters: {json.dumps(hp, indent=2)}")
        return None

    estimator = HuggingFace(
        entry_point="train_dpo.py",
        source_dir=str(Path(__file__).parent),
        instance_type="ml.g5.12xlarge",
        instance_count=1,
        role=role,
        transformers_version="4.45",
        pytorch_version="2.4",
        py_version="py311",
        output_path=s3_output,
        hyperparameters=hp,
        environment={
            "HUGGING_FACE_HUB_TOKEN": get_hf_token(),
        },
        distribution={"torch_distributed": {"enabled": True}},
        max_run=6 * 3600,
        job_name=job_name,
    )

    estimator.fit({"training": s3_train}, wait=False)
    print(f"  Launched: {job_name}")
    return job_name


def get_hf_token():
    """Read HF token from env or file."""
    import os
    token = os.environ.get("HUGGING_FACE_HUB_TOKEN", "")
    if not token:
        token_path = Path.home() / ".cache" / "huggingface" / "token"
        if token_path.exists():
            token = token_path.read_text().strip()
    return token


def create_bucket(s3_client):
    """Create S3 bucket if it doesn't exist."""
    try:
        s3_client.head_bucket(Bucket=BUCKET)
        print(f"Bucket s3://{BUCKET} exists")
    except Exception:
        print(f"Creating bucket s3://{BUCKET} in {REGION}")
        s3_client.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )


def main():
    parser = argparse.ArgumentParser(description="Launch DPO experiment on SageMaker")
    parser.add_argument("--dry-run", action="store_true", help="Print config without launching")
    parser.add_argument("--condition", type=str, default=None, help="Run single condition (a/c/e)")
    parser.add_argument("--seed", type=int, default=None, help="Run single seed")
    parser.add_argument("--upload-only", action="store_true", help="Only upload data to S3")
    args = parser.parse_args()

    s3 = boto3.client("s3", region_name=REGION)
    data_dir = Path(__file__).parent.parent / "data"

    create_bucket(s3)

    # Upload data for each condition
    condition_files = {
        "a": {"train.jsonl": data_dir / "train.jsonl", "val.jsonl": data_dir / "val.jsonl"},
        "c": {"train.jsonl": data_dir / "rlaif_train.jsonl", "val.jsonl": data_dir / "rlaif_val.jsonl"},
        "e": {"train.jsonl": data_dir / "public_rlhf_train.jsonl", "val.jsonl": data_dir / "public_rlhf_val.jsonl"},
    }

    conditions_to_run = [args.condition] if args.condition else list(CONDITIONS.keys())
    seeds_to_run = [args.seed] if args.seed else SEEDS

    print("=== Uploading training data to S3 ===")
    for cond in conditions_to_run:
        prefix = CONDITIONS[cond]["train_prefix"]
        for target_name, source_path in condition_files[cond].items():
            if source_path.exists():
                s3_key = f"{prefix}/{target_name}"
                print(f"  {source_path.name} -> s3://{BUCKET}/{s3_key}")
                if not args.dry_run:
                    s3.upload_file(str(source_path), BUCKET, s3_key)
            else:
                print(f"  WARNING: {source_path} not found!")

    if args.upload_only:
        print("\nData uploaded. Use --condition/--seed to launch training.")
        return

    # Get SageMaker role
    role = ROLE_ARN
    if not role:
        try:
            sess = sagemaker.Session(boto_session=boto3.Session(region_name=REGION))
            role = sagemaker.get_execution_role(sagemaker_session=sess)
        except Exception:
            print("ERROR: No SageMaker execution role. Set ROLE_ARN or run from SageMaker notebook.")
            print("Create role: aws iam create-role ... (see README)")
            return

    # Launch training jobs
    print(f"\n=== Launching DPO Training ===")
    print(f"Conditions: {conditions_to_run}")
    print(f"Seeds: {seeds_to_run}")
    print(f"Total jobs: {len(conditions_to_run) * len(seeds_to_run)}")

    jobs = []
    for cond in conditions_to_run:
        for seed in seeds_to_run:
            job = launch_training_job(cond, seed, role, dry_run=args.dry_run)
            if job:
                jobs.append(job)

    if jobs:
        print(f"\n=== {len(jobs)} jobs launched ===")
        print("Monitor: aws sagemaker list-training-jobs --region us-west-2")
        print("Or: SageMaker console -> Training -> Training jobs")

    # Estimated cost
    hours_per_job = 6
    cost_per_hour = 5.67
    total_jobs = len(conditions_to_run) * len(seeds_to_run)
    est_cost = total_jobs * hours_per_job * cost_per_hour
    print(f"\nEstimated cost: {total_jobs} jobs × {hours_per_job}h × ${cost_per_hour}/h = ${est_cost:.0f}")


if __name__ == "__main__":
    main()
