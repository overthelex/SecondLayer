#!/bin/bash
# Upload data splits to S3. Skips files that already exist.
#
# Usage: ./scripts/lextreme/sagemaker/upload_data.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

echo "=== Uploading data splits ==="
UPLOADED=0
SKIPPED=0

for epoch in "${EPOCHS[@]}"; do
  for split in train validation test; do
    src="${DATA_DIR}/${epoch}/${split}.jsonl"
    dst="${S3_DATA}${epoch}/${split}.jsonl"

    if [ ! -f "${src}" ]; then
      echo "  MISSING: ${src}"
      continue
    fi

    if aws s3 ls "${dst}" --region "${SM_REGION}" > /dev/null 2>&1; then
      echo "  EXISTS:  ${epoch}/${split}.jsonl"
      SKIPPED=$((SKIPPED + 1))
    else
      echo "  UPLOAD:  ${epoch}/${split}.jsonl ..."
      aws s3 cp "${src}" "${dst}" --region "${SM_REGION}"
      UPLOADED=$((UPLOADED + 1))
    fi
  done
done

echo ""
echo "Done: ${UPLOADED} uploaded, ${SKIPPED} already existed"
