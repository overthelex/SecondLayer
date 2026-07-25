#!/usr/bin/env python3
"""Launch the dense ranking dump for the COLIEE / Ukrainian case-retrieval
corpora on SageMaker.

One job covers both corpora and both encoders: the GPU work is only a few
minutes, so paying instance start-up four times would cost more than it saves.
This is a data dump, not an experiment, so the one-job-one-model rule for
training runs does not apply.

Cost: ml.g5.xlarge on-demand in us-west-2 is about $1.41/h; the job is expected
to bill 20-30 minutes including start-up and model download, so well under $1.

    python scripts/coliee/launch_rankings_sagemaker.py --upload
    python scripts/coliee/launch_rankings_sagemaker.py --wait
"""

import argparse
import os
import tarfile
import time
from pathlib import Path

import boto3

REGION = "us-west-2"
ROLE = "arn:aws:iam::272594900302:role/SageMakerDPOExecutionRole"
BUCKET = "secondlayer-ml-data-usw2"
IMAGE_URI = ("763104351884.dkr.ecr.us-west-2.amazonaws.com/"
             "pytorch-training:2.8.0-gpu-py312-cu129-ubuntu22.04-sagemaker")
PREFIX = "coliee-rankings"
LOCAL = Path("data/coliee/task1")
CORPUS_FILES = ["ua_case_retrieval.zip", "task1_train_files_2026.zip"]


def upload_corpus(s3):
    for name in CORPUS_FILES:
        key = f"{PREFIX}/corpus/{name}"
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
            print(f"  {name}: already in s3")
            continue
        except s3.exceptions.ClientError:
            pass
        size = (LOCAL / name).stat().st_size / 1e6
        print(f"  {name}: uploading {size:.0f} MB", flush=True)
        s3.upload_file(str(LOCAL / name), BUCKET, key)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--instance-type", default="ml.g5.xlarge")
    ap.add_argument("--models", default="e5,bge-m3")
    ap.add_argument("--corpora", default="ua,ca")
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--upload", action="store_true", help="push corpora to S3 first")
    ap.add_argument("--wait", action="store_true", help="poll until the job ends")
    ap.add_argument("--max-runtime-hours", type=float, default=2)
    args = ap.parse_args()

    s3 = boto3.client("s3", region_name=REGION)
    if args.upload:
        upload_corpus(s3)

    ts = int(time.time())
    job = f"coliee-rankings-{ts}"
    here = Path(__file__).parent
    code_key = f"{PREFIX}/code/{job}/sourcedir.tar.gz"
    tar_path = f"/tmp/{job}-source.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(here / "sm_rankings_entry.py", arcname="sm_rankings_entry.py")
        req = Path(tar_path).with_name(f"{job}-requirements.txt")
        req.write_text("sentence-transformers>=3.0\n")
        tar.add(req, arcname="requirements.txt")
        req.unlink()
    s3.upload_file(tar_path, BUCKET, code_key)
    os.remove(tar_path)

    sm = boto3.client("sagemaker", region_name=REGION)
    sm.create_training_job(
        TrainingJobName=job,
        RoleArn=ROLE,
        AlgorithmSpecification={"TrainingImage": IMAGE_URI,
                                "TrainingInputMode": "File"},
        HyperParameters={
            "models": args.models,
            "corpora": args.corpora,
            "batch_size": str(args.batch_size),
            "sagemaker_program": "sm_rankings_entry.py",
            "sagemaker_submit_directory": f"s3://{BUCKET}/{code_key}",
            "sagemaker_region": REGION,
        },
        InputDataConfig=[{
            "ChannelName": "corpus",
            "DataSource": {"S3DataSource": {
                "S3DataType": "S3Prefix",
                "S3Uri": f"s3://{BUCKET}/{PREFIX}/corpus/",
                "S3DataDistributionType": "FullyReplicated",
            }},
        }],
        OutputDataConfig={"S3OutputPath": f"s3://{BUCKET}/{PREFIX}/output/"},
        ResourceConfig={"InstanceType": args.instance_type,
                        "InstanceCount": 1, "VolumeSizeInGB": 60},
        StoppingCondition={
            "MaxRuntimeInSeconds": int(args.max_runtime_hours * 3600)},
        Tags=[{"Key": "project", "Value": "secondlayer"},
              {"Key": "experiment", "Value": "coliee-coupling"},
              {"Key": "workload", "Value": "ml-embedding"}],
    )
    print(f"launched {job} on {args.instance_type}")
    print(f"output: s3://{BUCKET}/{PREFIX}/output/{job}/output/model.tar.gz")

    if args.wait:
        while True:
            d = sm.describe_training_job(TrainingJobName=job)
            st = d["TrainingJobStatus"]
            sec = d.get("SecondaryStatus")
            print(f"  {st} / {sec}", flush=True)
            if st in ("Completed", "Failed", "Stopped"):
                if st != "Completed":
                    print(d.get("FailureReason", ""))
                bs = d.get("BillableTimeInSeconds")
                if bs:
                    print(f"  billable {bs}s (~${bs/3600*1.408:.2f} at "
                          f"$1.408/h on-demand)")
                break
            time.sleep(30)


if __name__ == "__main__":
    main()
