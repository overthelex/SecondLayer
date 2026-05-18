#!/usr/bin/env python3
"""Launch BGE-M3 dense retrieval on SageMaker via raw boto3 (us-west-2).

Supports:
  --spot       Use Managed Spot Training (60-70% cheaper)
  --on-demand  Force on-demand (default for backwards compat)
"""

import argparse
import boto3
import tarfile
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mlops"))
from spot_wrapper import enable_spot

region = "us-west-2"
role = "arn:aws:iam::272594900302:role/SageMakerDPOExecutionRole"
bucket = "secondlayer-ml-data-usw2"

image_uri = "763104351884.dkr.ecr.us-west-2.amazonaws.com/pytorch-training:2.1.0-gpu-py310-cu121-ubuntu20.04-sagemaker"

parser = argparse.ArgumentParser()
parser.add_argument("--spot", action="store_true", help="Use Managed Spot Training")
args = parser.parse_args()

job_name = f"bge-m3-retrieval-{int(time.time())}"

script_dir = os.path.dirname(os.path.abspath(__file__))
tar_path = "/tmp/bge-m3-source.tar.gz"
with tarfile.open(tar_path, "w:gz") as tar:
    tar.add(os.path.join(script_dir, "11_bge_m3_retrieval.py"), arcname="11_bge_m3_retrieval.py")
    tar.add(os.path.join(script_dir, "requirements.txt"), arcname="requirements.txt")

s3 = boto3.client("s3", region_name=region)
code_key = f"bge-m3-code/{job_name}/sourcedir.tar.gz"
s3.upload_file(tar_path, bucket, code_key)
print(f"Uploaded code to s3://{bucket}/{code_key}")

sm = boto3.client("sagemaker", region_name=region)

job_config = dict(
    TrainingJobName=job_name,
    RoleArn=role,
    AlgorithmSpecification={
        "TrainingImage": image_uri,
        "TrainingInputMode": "File",
    },
    HyperParameters={
        "sagemaker_program": "11_bge_m3_retrieval.py",
        "sagemaker_submit_directory": f"s3://{bucket}/{code_key}",
        "sagemaker_region": region,
    },
    InputDataConfig=[
        {
            "ChannelName": "data",
            "DataSource": {
                "S3DataSource": {
                    "S3DataType": "S3Prefix",
                    "S3Uri": f"s3://{bucket}/dense-input",
                    "S3DataDistributionType": "FullyReplicated",
                }
            },
        },
    ],
    OutputDataConfig={
        "S3OutputPath": f"s3://{bucket}/bge-m3-output",
    },
    ResourceConfig={
        "InstanceType": "ml.g5.xlarge",
        "InstanceCount": 1,
        "VolumeSizeInGB": 100,
    },
    StoppingCondition={
        "MaxRuntimeInSeconds": 7200,
    },
    Tags=[
        {"Key": "project", "Value": "secondlayer"},
        {"Key": "experiment", "Value": "bge-m3-retrieval"},
        {"Key": "workload", "Value": "ml-training"},
    ],
)

if args.spot:
    job_config = enable_spot(job_config, checkpoint_s3=f"s3://{bucket}/bge-m3-checkpoints/{job_name}/")
    print(f"Spot training enabled (savings ~60-70%)")

response = sm.create_training_job(**job_config)

print(f"Job launched: {job_name}")
print(f"Monitor: aws sagemaker describe-training-job --training-job-name {job_name} --region {region} --query TrainingJobStatus")
