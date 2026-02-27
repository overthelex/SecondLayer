#!/usr/bin/env bash
#
# Monitor bulk scrape progress: SQS depth, ASG instances, S3 count.
# Polls every INTERVAL seconds (default: 60).
#
# Usage:
#   ./03-monitor.sh                   # Poll every 60s
#   INTERVAL=30 ./03-monitor.sh       # Poll every 30s
#   ./03-monitor.sh --once            # Print once and exit
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
SQS_QUEUE_URL="${BULK_SCRAPE_SQS_QUEUE_URL}"
SQS_DLQ_URL="${BULK_SCRAPE_SQS_DLQ_URL}"
S3_BUCKET="${BULK_SCRAPE_S3_BUCKET}"

PREFIX="secondlayer-bulk-scrape"
ASG_NAME="${PREFIX}-asg"
INTERVAL="${INTERVAL:-60}"
ONCE="${1:-}"

print_status() {
  local ts=$(date '+%Y-%m-%d %H:%M:%S')

  # SQS queue depth
  local queue_depth=$(aws sqs get-queue-attributes \
    --queue-url "$SQS_QUEUE_URL" \
    --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
    --query "Attributes" --output json 2>/dev/null || echo '{}')

  local pending=$(echo "$queue_depth" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ApproximateNumberOfMessages','?'))" 2>/dev/null || echo "?")
  local inflight=$(echo "$queue_depth" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ApproximateNumberOfMessagesNotVisible','?'))" 2>/dev/null || echo "?")

  # DLQ depth
  local dlq_depth="?"
  if [ -n "$SQS_DLQ_URL" ]; then
    dlq_depth=$(aws sqs get-queue-attributes \
      --queue-url "$SQS_DLQ_URL" \
      --attribute-names ApproximateNumberOfMessages \
      --query "Attributes.ApproximateNumberOfMessages" --output text 2>/dev/null || echo "?")
  fi

  # ASG instances
  local asg_info=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG_NAME" \
    --query "AutoScalingGroups[0].{Desired:DesiredCapacity,Running:length(Instances[?LifecycleState=='InService'])}" \
    --output json 2>/dev/null || echo '{"Desired":"?","Running":"?"}')

  local desired=$(echo "$asg_info" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Desired','?'))" 2>/dev/null || echo "?")
  local running=$(echo "$asg_info" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Running','?'))" 2>/dev/null || echo "?")

  # S3 count (sample first 1000 to avoid slow listing)
  local s3_count=$(aws s3api list-objects-v2 \
    --bucket "$S3_BUCKET" --prefix "raw/" --max-keys 1 \
    --query "KeyCount" --output text 2>/dev/null || echo "?")

  echo "═══════════════════════════════════════════════════════════════"
  echo "  Bulk Scrape Monitor — $ts"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "  SQS Queue:"
  echo "    Pending:      $pending"
  echo "    In-flight:    $inflight"
  echo "    DLQ (failed): $dlq_depth"
  echo ""
  echo "  EC2 Workers:"
  echo "    Desired:      $desired"
  echo "    Running:      $running"
  echo ""
  echo "  S3 Raw Files:   ${s3_count}+"
  echo ""

  # Estimate completion
  if [ "$pending" != "?" ] && [ "$pending" != "0" ] && [ "$running" != "?" ] && [ "$running" != "0" ]; then
    # Rough: each instance does ~0.7 docs/s with 5 concurrent workers
    local rate_per_instance=3  # docs per second per instance (conservative)
    local total_rate=$((running * rate_per_instance))
    local eta_seconds=$((pending / total_rate))
    local eta_hours=$((eta_seconds / 3600))
    local eta_minutes=$(( (eta_seconds % 3600) / 60 ))
    echo "  Estimated time remaining: ~${eta_hours}h ${eta_minutes}m"
    echo "  (at ${total_rate} docs/s with ${running} workers)"
  fi

  if [ "$pending" = "0" ] && [ "$inflight" = "0" ]; then
    echo "  ** DOWNLOAD COMPLETE — Queue is empty **"
    echo "  Run: ./04-teardown.sh to remove workers"
    echo "  Then: bulk-scrape-processor to import S3 → PG"
  fi

  echo "═══════════════════════════════════════════════════════════════"
}

# Main
if [ "$ONCE" = "--once" ]; then
  print_status
  exit 0
fi

echo "Monitoring every ${INTERVAL}s. Ctrl+C to stop."
echo ""

trap 'echo ""; echo "Stopped."; exit 0' INT TERM

while true; do
  print_status
  sleep "$INTERVAL"
done
