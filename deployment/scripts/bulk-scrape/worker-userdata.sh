#!/usr/bin/env bash
#
# EC2 User Data script for bulk scrape workers.
# Installs Node.js 20, downloads worker script from S3, starts worker.
#
# This script is base64-encoded and passed to EC2 launch template.
# Variables __SQS_QUEUE_URL__, __S3_BUCKET__, __AWS_REGION__ are replaced
# by 02-launch-workers.sh before encoding.
#

set -euo pipefail
exec > /var/log/bulk-scrape-worker.log 2>&1

echo "=== Bulk Scrape Worker Bootstrap ==="
echo "Instance ID: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)"
echo "Instance type: $(curl -s http://169.254.169.254/latest/meta-data/instance-type)"
echo "Public IP: $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"

# Install Node.js 20
echo "[1/4] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install AWS SDK
echo "[2/4] Installing AWS SDK..."
mkdir -p /opt/bulk-scrape
cd /opt/bulk-scrape
npm init -y
npm install @aws-sdk/client-sqs @aws-sdk/client-s3

# Download worker script from S3
echo "[3/4] Downloading worker script..."
aws s3 cp "s3://__S3_BUCKET__/scripts/worker-scraper.js" /opt/bulk-scrape/worker-scraper.js

# Start worker
echo "[4/4] Starting worker..."
export SQS_QUEUE_URL="__SQS_QUEUE_URL__"
export S3_BUCKET="__S3_BUCKET__"
export AWS_REGION="__AWS_REGION__"
export CONCURRENCY="5"
export RATE_LIMIT_RPS="2"
export WORKER_ID="$(curl -s http://169.254.169.254/latest/meta-data/instance-id)"
export STATS_URL="__STATS_URL__"
export STATS_API_KEY="__STATS_API_KEY__"

# Run with restart on crash
while true; do
  echo "Starting worker at $(date)..."
  node /opt/bulk-scrape/worker-scraper.js || true
  echo "Worker exited at $(date), restarting in 10s..."
  sleep 10
done
