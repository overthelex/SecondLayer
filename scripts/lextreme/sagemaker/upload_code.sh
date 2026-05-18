#!/bin/bash
# Package and upload training code to S3.
# Run after any change to train_temporal.py or requirements.txt.
#
# Usage: ./scripts/lextreme/sagemaker/upload_code.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

echo "=== Packaging source code ==="
TMPDIR=$(mktemp -d)
trap "rm -rf ${TMPDIR}" EXIT

mkdir -p "${TMPDIR}/code"
cp "${LEXTREME_DIR}/train_temporal.py" "${TMPDIR}/code/"
cp "${LEXTREME_DIR}/requirements.txt" "${TMPDIR}/code/"

(cd "${TMPDIR}/code" && tar czf "${TMPDIR}/sourcedir.tar.gz" .)

aws s3 cp "${TMPDIR}/sourcedir.tar.gz" "${S3_CODE}" --region "${SM_REGION}"
echo "  Uploaded: ${S3_CODE}"
echo "  Contents: train_temporal.py, requirements.txt"
