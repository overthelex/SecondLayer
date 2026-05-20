#!/usr/bin/env python3
"""
Deploy a self-hosted MLflow Tracking Server on AWS (t3.small, ~$15/mo).

Creates:
  - EC2 instance with MLflow + PostgreSQL backend store + S3 artifact store
  - Security group (port 5000 from VPC only)
  - S3 bucket for artifacts

Usage:
  python setup_mlflow.py                # Deploy MLflow server
  python setup_mlflow.py --teardown     # Remove everything
"""

import argparse
import boto3
import time
import json
import sys

REGION = "us-west-2"
INSTANCE_TYPE = "t3.small"
MLFLOW_PORT = 5000
S3_ARTIFACT_BUCKET = "secondlayer-mlflow-artifacts"
KEY_NAME = "secondlayer-prod"
STACK_TAG = {"Key": "project", "Value": "secondlayer-mlops"}

ec2 = boto3.client("ec2", region_name=REGION)
ec2r = boto3.resource("ec2", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


def get_default_vpc():
    vpcs = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])
    return vpcs["Vpcs"][0]["VpcId"] if vpcs["Vpcs"] else None


def get_latest_ami():
    images = ec2.describe_images(
        Owners=["amazon"],
        Filters=[
            {"Name": "name", "Values": ["al2023-ami-2023.*-x86_64"]},
            {"Name": "state", "Values": ["available"]},
        ],
    )
    return sorted(images["Images"], key=lambda x: x["CreationDate"], reverse=True)[0]["ImageId"]


def create_s3_bucket():
    try:
        s3.create_bucket(
            Bucket=S3_ARTIFACT_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )
        print(f"  Created S3 bucket: {S3_ARTIFACT_BUCKET}")
    except s3.exceptions.BucketAlreadyOwnedByYou:
        print(f"  S3 bucket already exists: {S3_ARTIFACT_BUCKET}")


def create_security_group(vpc_id):
    existing = ec2.describe_security_groups(
        Filters=[
            {"Name": "group-name", "Values": ["mlflow-tracking-server"]},
            {"Name": "vpc-id", "Values": [vpc_id]},
        ]
    )
    if existing["SecurityGroups"]:
        sg_id = existing["SecurityGroups"][0]["GroupId"]
        print(f"  Security group exists: {sg_id}")
        return sg_id

    sg = ec2.create_security_group(
        GroupName="mlflow-tracking-server",
        Description="MLflow Tracking Server - port 5000 VPC only",
        VpcId=vpc_id,
    )
    sg_id = sg["GroupId"]

    vpc_cidr = ec2.describe_vpcs(VpcIds=[vpc_id])["Vpcs"][0]["CidrBlock"]
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22,
             "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "SSH"}]},
            {"IpProtocol": "tcp", "FromPort": MLFLOW_PORT, "ToPort": MLFLOW_PORT,
             "IpRanges": [{"CidrIp": vpc_cidr, "Description": "MLflow from VPC"}]},
        ],
    )
    ec2.create_tags(Resources=[sg_id], Tags=[STACK_TAG])
    print(f"  Created security group: {sg_id}")
    return sg_id


USER_DATA = f"""#!/bin/bash
set -e
yum update -y
yum install -y python3-pip postgresql15-server

# Init PostgreSQL
postgresql-setup --initdb
systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql -c "CREATE USER mlflow WITH PASSWORD 'mlflow_local';"
sudo -u postgres psql -c "CREATE DATABASE mlflow OWNER mlflow;"

# Install MLflow
pip3 install mlflow boto3 psycopg2-binary

# Create systemd service
cat > /etc/systemd/system/mlflow.service << 'SVCEOF'
[Unit]
Description=MLflow Tracking Server
After=postgresql.service

[Service]
Type=simple
User=ec2-user
ExecStart=/usr/local/bin/mlflow server \\
    --backend-store-uri postgresql://mlflow:mlflow_local@localhost/mlflow \\
    --default-artifact-root s3://{S3_ARTIFACT_BUCKET}/artifacts \\
    --host 0.0.0.0 \\
    --port {MLFLOW_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable mlflow
systemctl start mlflow
"""


def launch_instance(sg_id, ami_id):
    existing = ec2.describe_instances(
        Filters=[
            {"Name": "tag:project", "Values": ["secondlayer-mlops"]},
            {"Name": "tag:Name", "Values": ["mlflow-tracking-server"]},
            {"Name": "instance-state-name", "Values": ["running", "pending"]},
        ]
    )
    for r in existing["Reservations"]:
        for inst in r["Instances"]:
            print(f"  MLflow instance already running: {inst['InstanceId']} ({inst.get('PrivateIpAddress', '?')})")
            return inst["InstanceId"], inst.get("PrivateIpAddress")

    instance = ec2r.create_instances(
        ImageId=ami_id,
        InstanceType=INSTANCE_TYPE,
        KeyName=KEY_NAME,
        SecurityGroupIds=[sg_id],
        MinCount=1, MaxCount=1,
        UserData=USER_DATA,
        IamInstanceProfile={"Name": "mlflow-tracking-ec2-profile"},
        TagSpecifications=[{
            "ResourceType": "instance",
            "Tags": [
                STACK_TAG,
                {"Key": "Name", "Value": "mlflow-tracking-server"},
            ],
        }],
        BlockDeviceMappings=[{
            "DeviceName": "/dev/xvda",
            "Ebs": {"VolumeSize": 20, "VolumeType": "gp3"},
        }],
    )[0]

    print(f"  Launched instance: {instance.id}, waiting for running state...")
    instance.wait_until_running()
    instance.reload()
    print(f"  Instance running: {instance.private_ip_address}")
    return instance.id, instance.private_ip_address


def deploy():
    print("Deploying MLflow Tracking Server...")
    vpc_id = get_default_vpc()
    if not vpc_id:
        print("ERROR: No default VPC found")
        sys.exit(1)
    print(f"  VPC: {vpc_id}")

    create_s3_bucket()
    ami_id = get_latest_ami()
    print(f"  AMI: {ami_id}")
    sg_id = create_security_group(vpc_id)
    instance_id, private_ip = launch_instance(sg_id, ami_id)

    config = {
        "mlflow_tracking_uri": f"http://{private_ip}:{MLFLOW_PORT}",
        "artifact_bucket": S3_ARTIFACT_BUCKET,
        "instance_id": instance_id,
        "region": REGION,
    }

    config_path = "/home/vovkes/SecondLayer/scripts/mlops/mlflow_config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"\n  Config saved: {config_path}")
    print(f"  MLflow UI: {config['mlflow_tracking_uri']}")
    print(f"  Artifacts: s3://{S3_ARTIFACT_BUCKET}/artifacts")
    print(f"\n  Wait ~3 min for MLflow service to start.")
    return config


def teardown():
    print("Tearing down MLflow infrastructure...")
    instances = ec2.describe_instances(
        Filters=[
            {"Name": "tag:project", "Values": ["secondlayer-mlops"]},
            {"Name": "instance-state-name", "Values": ["running", "pending", "stopped"]},
        ]
    )
    for r in instances["Reservations"]:
        for inst in r["Instances"]:
            ec2.terminate_instances(InstanceIds=[inst["InstanceId"]])
            print(f"  Terminated: {inst['InstanceId']}")

    sgs = ec2.describe_security_groups(
        Filters=[{"Name": "tag:project", "Values": ["secondlayer-mlops"]}]
    )
    for sg in sgs["SecurityGroups"]:
        try:
            ec2.delete_security_group(GroupId=sg["GroupId"])
            print(f"  Deleted SG: {sg['GroupId']}")
        except Exception as e:
            print(f"  SG {sg['GroupId']} delete deferred (instance terminating): {e}")

    print("  Done. S3 bucket preserved (contains artifacts).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--teardown", action="store_true")
    args = parser.parse_args()
    if args.teardown:
        teardown()
    else:
        deploy()
