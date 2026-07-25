#!/usr/bin/env bash
#
# Create AWS infrastructure for distributed court decision scraping.
# Creates: S3 bucket, SQS queue + DLQ, IAM role, security group.
#
# Prerequisites:
#   - AWS CLI configured (aws configure or env vars)
#   - .env.prod has AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
#
# Usage:
#   ./01-create-infra.sh
#   AWS_REGION=eu-central-1 ./01-create-infra.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Load env if available
if [ -f "$DEPLOY_DIR/.env.prod" ]; then
  set -a; source "$DEPLOY_DIR/.env.prod"; set +a
fi

REGION="${AWS_REGION:-eu-central-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PREFIX="secondlayer-bulk-scrape"

S3_BUCKET="${PREFIX}-raw"
SQS_QUEUE="${PREFIX}-queue"
SQS_DLQ="${PREFIX}-dlq"
IAM_ROLE="${PREFIX}-worker-role"
IAM_POLICY="${PREFIX}-worker-policy"
IAM_INSTANCE_PROFILE="${PREFIX}-worker-profile"
SECURITY_GROUP="${PREFIX}-worker-sg"

echo "=== Creating Bulk Scrape Infrastructure ==="
echo "  Region:     $REGION"
echo "  Account:    $ACCOUNT_ID"
echo "  S3 Bucket:  $S3_BUCKET"
echo "  SQS Queue:  $SQS_QUEUE"
echo ""

# --- S3 Bucket ---
echo "[1/5] Creating S3 bucket: $S3_BUCKET"
if aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
  echo "  Bucket already exists, skipping."
else
  aws s3api create-bucket \
    --bucket "$S3_BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"

  # Lifecycle: delete raw/ objects after 30 days
  aws s3api put-bucket-lifecycle-configuration \
    --bucket "$S3_BUCKET" \
    --lifecycle-configuration '{
      "Rules": [{
        "ID": "delete-raw-after-30d",
        "Filter": {"Prefix": "raw/"},
        "Status": "Enabled",
        "Expiration": {"Days": 30}
      }]
    }'

  echo "  Created with 30-day lifecycle on raw/ prefix."
fi

# --- SQS Dead Letter Queue ---
echo ""
echo "[2/5] Creating SQS DLQ: $SQS_DLQ"
DLQ_URL=$(aws sqs get-queue-url --queue-name "$SQS_DLQ" --query QueueUrl --output text 2>/dev/null || echo "")
if [ -n "$DLQ_URL" ]; then
  echo "  DLQ already exists: $DLQ_URL"
else
  DLQ_URL=$(aws sqs create-queue \
    --queue-name "$SQS_DLQ" \
    --attributes '{
      "MessageRetentionPeriod": "1209600",
      "VisibilityTimeout": "300"
    }' \
    --query QueueUrl --output text)
  echo "  Created: $DLQ_URL"
fi
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query "Attributes.QueueArn" --output text)

# --- SQS Main Queue ---
echo ""
echo "[3/5] Creating SQS queue: $SQS_QUEUE"
QUEUE_URL=$(aws sqs get-queue-url --queue-name "$SQS_QUEUE" --query QueueUrl --output text 2>/dev/null || echo "")
if [ -n "$QUEUE_URL" ]; then
  echo "  Queue already exists: $QUEUE_URL"
else
  QUEUE_URL=$(aws sqs create-queue \
    --queue-name "$SQS_QUEUE" \
    --attributes "{
      \"VisibilityTimeout\": \"300\",
      \"MessageRetentionPeriod\": \"1209600\",
      \"ReceiveMessageWaitTimeSeconds\": \"20\",
      \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
    }" \
    --query QueueUrl --output text)
  echo "  Created: $QUEUE_URL"
fi

# --- IAM Role for EC2 Workers ---
echo ""
echo "[4/5] Creating IAM role: $IAM_ROLE"
ROLE_EXISTS=$(aws iam get-role --role-name "$IAM_ROLE" 2>/dev/null && echo "yes" || echo "no")
if [ "$ROLE_EXISTS" = "yes" ]; then
  echo "  Role already exists, skipping."
else
  # Trust policy: allow EC2 to assume this role
  aws iam create-role \
    --role-name "$IAM_ROLE" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ec2.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'

  # Permissions: SQS receive/delete + S3 put + CloudWatch logs
  QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn --query "Attributes.QueueArn" --output text)

  aws iam put-role-policy \
    --role-name "$IAM_ROLE" \
    --policy-name "$IAM_POLICY" \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [
        {
          \"Effect\": \"Allow\",
          \"Action\": [
            \"sqs:ReceiveMessage\",
            \"sqs:DeleteMessage\",
            \"sqs:ChangeMessageVisibility\",
            \"sqs:GetQueueAttributes\",
            \"sqs:GetQueueUrl\"
          ],
          \"Resource\": \"${QUEUE_ARN}\"
        },
        {
          \"Effect\": \"Allow\",
          \"Action\": [
            \"s3:PutObject\",
            \"s3:GetObject\"
          ],
          \"Resource\": \"arn:aws:s3:::${S3_BUCKET}/*\"
        },
        {
          \"Effect\": \"Allow\",
          \"Action\": \"s3:ListBucket\",
          \"Resource\": \"arn:aws:s3:::${S3_BUCKET}\"
        }
      ]
    }"

  # Instance profile for EC2
  aws iam create-instance-profile --instance-profile-name "$IAM_INSTANCE_PROFILE" 2>/dev/null || true
  aws iam add-role-to-instance-profile \
    --instance-profile-name "$IAM_INSTANCE_PROFILE" \
    --role-name "$IAM_ROLE" 2>/dev/null || true

  echo "  Created role + instance profile."
fi

# --- Security Group ---
echo ""
echo "[5/5] Creating security group: $SECURITY_GROUP"

# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SECURITY_GROUP" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")

if [ "$SG_ID" != "None" ] && [ -n "$SG_ID" ]; then
  echo "  Security group already exists: $SG_ID"
else
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$SECURITY_GROUP" \
    --description "Bulk scrape workers - outbound only" \
    --vpc-id "$VPC_ID" \
    --query GroupId --output text)

  # Allow SSH from prod EC2 for debugging (optional)
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp --port 22 \
    --cidr "18.192.189.254/32" 2>/dev/null || true

  echo "  Created: $SG_ID"
fi

# --- Output ---
echo ""
echo "=== Infrastructure Created ==="
echo ""
echo "# Add these to .env.prod or export before running bulk-scrape scripts:"
echo "export BULK_SCRAPE_S3_BUCKET=$S3_BUCKET"
echo "export BULK_SCRAPE_SQS_QUEUE_URL=$QUEUE_URL"
echo "export BULK_SCRAPE_SQS_DLQ_URL=$DLQ_URL"
echo "export BULK_SCRAPE_IAM_PROFILE=$IAM_INSTANCE_PROFILE"
echo "export BULK_SCRAPE_SECURITY_GROUP=$SG_ID"
echo "export BULK_SCRAPE_REGION=$REGION"

# Save to a config file for other scripts
cat > "$SCRIPT_DIR/infra-config.env" <<EOF
BULK_SCRAPE_S3_BUCKET=$S3_BUCKET
BULK_SCRAPE_SQS_QUEUE_URL=$QUEUE_URL
BULK_SCRAPE_SQS_DLQ_URL=$DLQ_URL
BULK_SCRAPE_IAM_PROFILE=$IAM_INSTANCE_PROFILE
BULK_SCRAPE_SECURITY_GROUP=$SG_ID
BULK_SCRAPE_REGION=$REGION
BULK_SCRAPE_ACCOUNT_ID=$ACCOUNT_ID
EOF
echo ""
echo "Config saved to: $SCRIPT_DIR/infra-config.env"
