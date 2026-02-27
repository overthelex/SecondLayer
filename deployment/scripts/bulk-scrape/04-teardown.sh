#!/usr/bin/env bash
#
# Teardown AWS infrastructure for bulk scraping.
# Removes: ASG, launch template, security group.
# Optionally removes: SQS queues, S3 bucket, IAM role.
#
# Usage:
#   ./04-teardown.sh              # Teardown compute only (ASG, launch template)
#   ./04-teardown.sh --all        # Teardown everything including S3, SQS, IAM
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEARDOWN_ALL="${1:-}"
PREFIX="secondlayer-bulk-scrape"

# Load infra config
if [ -f "$SCRIPT_DIR/infra-config.env" ]; then
  set -a; source "$SCRIPT_DIR/infra-config.env"; set +a
fi

REGION="${BULK_SCRAPE_REGION:-eu-central-1}"

echo "=== Tearing Down Bulk Scrape Infrastructure ==="
echo "  Mode: ${TEARDOWN_ALL:+FULL (including S3/SQS/IAM)}${TEARDOWN_ALL:-compute only}"
echo ""

# --- ASG ---
echo "[1/6] Deleting Auto Scaling Group..."
ASG_NAME="${PREFIX}-asg"
if aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" --query "AutoScalingGroups[0].AutoScalingGroupName" --output text 2>/dev/null | grep -q "$ASG_NAME"; then
  # Scale to 0 first, then delete
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --min-size 0 --max-size 0 --desired-capacity 0
  echo "  Scaled to 0, waiting for instances to terminate..."
  sleep 30

  aws autoscaling delete-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --force-delete
  echo "  Deleted ASG."
else
  echo "  ASG not found, skipping."
fi

# --- Launch Template ---
echo ""
echo "[2/6] Deleting Launch Template..."
LT_NAME="${PREFIX}-lt"
if aws ec2 describe-launch-templates --launch-template-names "$LT_NAME" 2>/dev/null | grep -q "$LT_NAME"; then
  aws ec2 delete-launch-template --launch-template-name "$LT_NAME"
  echo "  Deleted launch template."
else
  echo "  Launch template not found, skipping."
fi

# --- Security Group ---
echo ""
echo "[3/6] Deleting Security Group..."
SG_NAME="${PREFIX}-worker-sg"
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SG_NAME" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")

if [ "$SG_ID" != "None" ] && [ -n "$SG_ID" ]; then
  # Wait a bit for instances to fully terminate
  sleep 10
  aws ec2 delete-security-group --group-id "$SG_ID" 2>/dev/null && echo "  Deleted: $SG_ID" || echo "  Could not delete (instances may still be terminating). Try again in a few minutes."
else
  echo "  Security group not found, skipping."
fi

if [ "$TEARDOWN_ALL" != "--all" ]; then
  echo ""
  echo "=== Compute teardown complete ==="
  echo "S3, SQS, and IAM resources preserved. Run with --all to remove everything."
  exit 0
fi

# --- SQS Queues ---
echo ""
echo "[4/6] Deleting SQS queues..."
SQS_QUEUE_URL="${BULK_SCRAPE_SQS_QUEUE_URL:-}"
SQS_DLQ_URL="${BULK_SCRAPE_SQS_DLQ_URL:-}"

if [ -n "$SQS_QUEUE_URL" ]; then
  aws sqs delete-queue --queue-url "$SQS_QUEUE_URL" 2>/dev/null && echo "  Deleted queue: $SQS_QUEUE_URL" || echo "  Queue not found."
fi
if [ -n "$SQS_DLQ_URL" ]; then
  aws sqs delete-queue --queue-url "$SQS_DLQ_URL" 2>/dev/null && echo "  Deleted DLQ: $SQS_DLQ_URL" || echo "  DLQ not found."
fi

# --- IAM ---
echo ""
echo "[5/6] Deleting IAM role and instance profile..."
IAM_ROLE="${PREFIX}-worker-role"
IAM_POLICY="${PREFIX}-worker-policy"
IAM_PROFILE="${PREFIX}-worker-profile"

# Remove role from instance profile, delete profile
aws iam remove-role-from-instance-profile \
  --instance-profile-name "$IAM_PROFILE" \
  --role-name "$IAM_ROLE" 2>/dev/null || true
aws iam delete-instance-profile --instance-profile-name "$IAM_PROFILE" 2>/dev/null || true

# Delete inline policy, then role
aws iam delete-role-policy --role-name "$IAM_ROLE" --policy-name "$IAM_POLICY" 2>/dev/null || true
aws iam delete-role --role-name "$IAM_ROLE" 2>/dev/null && echo "  Deleted IAM role." || echo "  IAM role not found."

# --- S3 Bucket ---
echo ""
echo "[6/6] Deleting S3 bucket..."
S3_BUCKET="${BULK_SCRAPE_S3_BUCKET:-${PREFIX}-raw}"
if aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
  echo "  Emptying bucket first..."
  aws s3 rm "s3://$S3_BUCKET" --recursive
  aws s3api delete-bucket --bucket "$S3_BUCKET"
  echo "  Deleted: $S3_BUCKET"
else
  echo "  Bucket not found, skipping."
fi

# Clean up config file
rm -f "$SCRIPT_DIR/infra-config.env"

echo ""
echo "=== Full teardown complete ==="
