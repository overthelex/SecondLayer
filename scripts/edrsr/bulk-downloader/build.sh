#!/bin/bash
# Build bulk-downloader for Linux amd64 (production server)
set -euo pipefail

cd "$(dirname "$0")"

echo "Building bulk-downloader..."
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bulk-downloader-linux-amd64 .
echo "Done: $(ls -lh bulk-downloader-linux-amd64)"

# Also build native (for local testing)
go build -o bulk-downloader .
echo "Local: $(ls -lh bulk-downloader)"
