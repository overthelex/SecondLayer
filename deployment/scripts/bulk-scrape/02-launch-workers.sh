#!/usr/bin/env bash
#
# Launch EC2 Spot Auto Scaling Group for bulk scraping.
# Creates a launch template with mixed instance types and starts an ASG.
#
# Prerequisites:
#   - Run 01-create-infra.sh first (creates S3, SQS, IAM, SG)
#   - Upload worker script: aws s3 cp worker-scraper.js s3://BUCKET/scripts/
#
# Usage:
#   ./02-launch-workers.sh                    # Default: 20 instances
#   DESIRED=10 MAX=20 ./02-launch-workers.sh  # Custom sizing
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load infra config
if [ ! -f "$SCRIPT_DIR/infra-config.env" ]; then
  echo "ERROR: infra-config.env not found. Run 01-create-infra.sh first."
  exit 1
fi
set -a; source "$SCRIPT_DIR/infra-config.env"; set +a

REGION="${BULK_SCRAPE_REGION}"
S3_BUCKET="${BULK_SCRAPE_S3_BUCKET}"
SQS_QUEUE_URL="${BULK_SCRAPE_SQS_QUEUE_URL}"
IAM_PROFILE="${BULK_SCRAPE_IAM_PROFILE}"
SG_ID="${BULK_SCRAPE_SECURITY_GROUP}"
STATS_URL="${BULK_SCRAPE_STATS_URL:-}"
STATS_API_KEY="${BULK_SCRAPE_STATS_API_KEY:-}"

PREFIX="secondlayer-bulk-scrape"
LT_NAME="${PREFIX}-lt"
ASG_NAME="${PREFIX}-asg"

DESIRED="${DESIRED:-20}"
MIN="${MIN:-0}"
MAX="${MAX:-40}"

echo "=== Launching Bulk Scrape Workers ==="
echo "  Region:    $REGION"
echo "  Desired:   $DESIRED"
echo "  Min/Max:   $MIN/$MAX"
echo "  Bucket:    $S3_BUCKET"
echo "  Queue:     $SQS_QUEUE_URL"
echo ""

# [1] Upload worker script to S3
echo "[1/3] Uploading worker script to S3..."
aws s3 cp "$SCRIPT_DIR/worker-scraper.js" "s3://$S3_BUCKET/scripts/worker-scraper.js"
echo "  Uploaded."

# [2] Create or update launch template
echo ""
echo "[2/3] Creating launch template: $LT_NAME"

# Prepare user-data with variable substitution
USERDATA=$(cat "$SCRIPT_DIR/worker-userdata.sh" \
  | sed "s|__SQS_QUEUE_URL__|${SQS_QUEUE_URL}|g" \
  | sed "s|__S3_BUCKET__|${S3_BUCKET}|g" \
  | sed "s|__AWS_REGION__|${REGION}|g" \
  | sed "s|__STATS_URL__|${STATS_URL}|g" \
  | sed "s|__STATS_API_KEY__|${STATS_API_KEY}|g" \
  | base64 -w 0)

# Get latest Ubuntu 22.04 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query "Images | sort_by(@, &CreationDate) | [-1].ImageId" \
  --output text)

echo "  AMI: $AMI_ID"

# Delete existing launch template if present
aws ec2 delete-launch-template --launch-template-name "$LT_NAME" 2>/dev/null || true

aws ec2 create-launch-template \
  --launch-template-name "$LT_NAME" \
  --launch-template-data "{
    \"ImageId\": \"${AMI_ID}\",
    \"InstanceType\": \"c5.large\",
    \"IamInstanceProfile\": {\"Name\": \"${IAM_PROFILE}\"},
    \"SecurityGroupIds\": [\"${SG_ID}\"],
    \"UserData\": \"${USERDATA}\",
    \"InstanceMarketOptions\": {
      \"MarketType\": \"spot\",
      \"SpotOptions\": {
        \"SpotInstanceType\": \"one-time\",
        \"InstanceInterruptionBehavior\": \"terminate\"
      }
    },
    \"TagSpecifications\": [{
      \"ResourceType\": \"instance\",
      \"Tags\": [
        {\"Key\": \"Name\", \"Value\": \"bulk-scrape-worker\"},
        {\"Key\": \"Project\", \"Value\": \"SecondLayer\"},
        {\"Key\": \"Purpose\", \"Value\": \"court-decision-scraping\"}
      ]
    }]
  }"

echo "  Launch template created."

# [3] Create ASG with mixed instances
echo ""
echo "[3/3] Creating Auto Scaling Group: $ASG_NAME"

# Get all availability zones in the region
AZS=$(aws ec2 describe-availability-zones \
  --region "$REGION" \
  --query "AvailabilityZones[?State=='available'].ZoneName" \
  --output text | tr '\t' ',')

# Delete existing ASG if present
if aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" --query "AutoScalingGroups[0].AutoScalingGroupName" --output text 2>/dev/null | grep -q "$ASG_NAME"; then
  echo "  Existing ASG found, updating..."
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --min-size "$MIN" --max-size "$MAX" --desired-capacity "$DESIRED"
else
  aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --mixed-instances-policy "{
      \"LaunchTemplate\": {
        \"LaunchTemplateSpecification\": {
          \"LaunchTemplateName\": \"${LT_NAME}\",
          \"Version\": \"\$Latest\"
        },
        \"Overrides\": [
          {\"InstanceType\": \"c6i.large\"},
          {\"InstanceType\": \"c5.large\"},
          {\"InstanceType\": \"c5a.large\"},
          {\"InstanceType\": \"m5.large\"},
          {\"InstanceType\": \"m5a.large\"}
        ]
      },
      \"InstancesDistribution\": {
        \"OnDemandBaseCapacity\": 0,
        \"OnDemandPercentageAboveBaseCapacity\": 0,
        \"SpotAllocationStrategy\": \"capacity-optimized\"
      }
    }" \
    --min-size "$MIN" \
    --max-size "$MAX" \
    --desired-capacity "$DESIRED" \
    --availability-zones $AZS \
    --tags \
      "Key=Name,Value=bulk-scrape-worker,PropagateAtLaunch=true" \
      "Key=Project,Value=SecondLayer,PropagateAtLaunch=true"

  echo "  ASG created with $DESIRED instances."
fi

echo ""
echo "=== Workers Launching ==="
echo ""
echo "Monitor with: ./03-monitor.sh"
echo "Scale:        aws autoscaling update-auto-scaling-group --auto-scaling-group-name $ASG_NAME --desired-capacity N"
echo "Teardown:     ./04-teardown.sh"
