#!/usr/bin/env python3
"""
Set up AWS Budgets + cost allocation tags for ML workloads.

Creates:
  - Monthly budget with alerts at $500, $1000, $5000
  - Cost allocation tags: project, experiment, workload
  - Applies tags to existing S3 buckets and SageMaker role

Usage:
  python setup_budgets.py
  python setup_budgets.py --email alerts@legal.org.ua
"""

import argparse
import boto3
import json
import sys

ACCOUNT_ID = "272594900302"
DEFAULT_EMAIL = "mcvovkes@gmail.com"
BUDGET_NAME = "SecondLayer-ML-Monthly"
MONTHLY_LIMIT = "5000"

ML_TAGS = [
    {"Key": "project", "Value": "secondlayer"},
    {"Key": "workload", "Value": "ml-training"},
]

S3_BUCKETS = [
    "secondlayer-ml-data-usw2",
    "secondlayer-rlhf-exp4",
]


def setup_budgets(email: str):
    budgets = boto3.client("budgets", region_name="us-east-1")

    try:
        budgets.describe_budget(AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME)
        print(f"  Budget '{BUDGET_NAME}' already exists, updating...")
        budgets.delete_budget(AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME)
    except budgets.exceptions.NotFoundException:
        pass

    budgets.create_budget(
        AccountId=ACCOUNT_ID,
        Budget={
            "BudgetName": BUDGET_NAME,
            "BudgetLimit": {"Amount": MONTHLY_LIMIT, "Unit": "USD"},
            "BudgetType": "COST",
            "TimeUnit": "MONTHLY",
            "CostFilters": {
                "Service": [
                    "Amazon SageMaker",
                    "Amazon Elastic Compute Cloud - Compute",
                    "Amazon Simple Storage Service",
                ]
            },
            "CostTypes": {
                "IncludeTax": True,
                "IncludeSubscription": True,
                "UseBlended": False,
                "IncludeRefund": False,
                "IncludeCredit": False,
                "IncludeSupport": True,
            },
        },
        NotificationsWithSubscribers=[
            {
                "Notification": {
                    "NotificationType": "ACTUAL",
                    "ComparisonOperator": "GREATER_THAN",
                    "Threshold": 10.0,
                    "ThresholdType": "PERCENTAGE",
                },
                "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
            },
            {
                "Notification": {
                    "NotificationType": "ACTUAL",
                    "ComparisonOperator": "GREATER_THAN",
                    "Threshold": 20.0,
                    "ThresholdType": "PERCENTAGE",
                },
                "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
            },
            {
                "Notification": {
                    "NotificationType": "ACTUAL",
                    "ComparisonOperator": "GREATER_THAN",
                    "Threshold": 50.0,
                    "ThresholdType": "PERCENTAGE",
                },
                "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
            },
            {
                "Notification": {
                    "NotificationType": "FORECASTED",
                    "ComparisonOperator": "GREATER_THAN",
                    "Threshold": 100.0,
                    "ThresholdType": "PERCENTAGE",
                },
                "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
            },
        ],
    )
    print(f"  Created budget '{BUDGET_NAME}': ${MONTHLY_LIMIT}/month")
    print(f"  Alerts at: $500 (10%), $1000 (20%), $2500 (50%), forecast > $5000")
    print(f"  Notifications to: {email}")


def tag_s3_buckets():
    s3 = boto3.client("s3", region_name="us-west-2")
    for bucket in S3_BUCKETS:
        try:
            existing = s3.get_bucket_tagging(Bucket=bucket).get("TagSet", [])
        except Exception:
            existing = []

        existing_keys = {t["Key"] for t in existing}
        new_tags = existing + [t for t in ML_TAGS if t["Key"] not in existing_keys]
        s3.put_bucket_tagging(Bucket=bucket, Tagging={"TagSet": new_tags})
        print(f"  Tagged s3://{bucket}: {[t['Key'] for t in new_tags]}")


def tag_sagemaker_jobs():
    sm = boto3.client("sagemaker", region_name="us-west-2")
    jobs = sm.list_training_jobs(MaxResults=20, SortBy="CreationTime", SortOrder="Descending")
    tagged = 0
    for job in jobs["TrainingJobSummaries"]:
        try:
            sm.add_tags(
                ResourceArn=job["TrainingJobArn"],
                Tags=ML_TAGS + [{"Key": "experiment", "Value": job["TrainingJobName"].split("-")[0]}],
            )
            tagged += 1
        except Exception as e:
            print(f"  Warning: couldn't tag {job['TrainingJobName']}: {e}")
    print(f"  Tagged {tagged} recent SageMaker jobs")


def activate_cost_allocation_tags():
    ce = boto3.client("ce", region_name="us-east-1")
    try:
        ce.update_cost_allocation_tags_status(
            CostAllocationTagsStatus=[
                {"TagKey": "project", "Status": "Active"},
                {"TagKey": "experiment", "Status": "Active"},
                {"TagKey": "workload", "Status": "Active"},
            ]
        )
        print("  Activated cost allocation tags: project, experiment, workload")
    except Exception as e:
        print(f"  Cost allocation tags activation (may need manual console step): {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    args = parser.parse_args()

    print("Setting up AWS Budgets and cost governance...")
    setup_budgets(args.email)
    print("\nTagging existing resources...")
    tag_s3_buckets()
    tag_sagemaker_jobs()
    print("\nActivating cost allocation tags...")
    activate_cost_allocation_tags()
    print("\nDone. Budget alerts will start arriving when thresholds are crossed.")


if __name__ == "__main__":
    main()
