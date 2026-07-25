#!/usr/bin/env bash
# Materialize the Prometheus bearer-token file for the bigbox EDRSR Qdrant
# scrape (job `qdrant_edrsr` in prometheus-prod.yml) from QDRANT_EDRSR_API_KEY
# in deployment/.env.prod.
#
# Why this exists: the key file is a secret and is gitignored (*.key), so it is
# NOT in the repo. Prometheus fails to START if a referenced credentials_file is
# missing — so on a from-scratch prometheus-prod rebuild the whole monitoring
# stack would be down. Running this on every deploy guarantees the file exists
# and is readable by the in-container prometheus user (nobody) → mode 0644, to
# match the sibling rule files.
#
# Idempotent and safe to run unconditionally. Never fails the deploy: if the env
# var is absent it warns and exits 0 (an existing key file, if any, is left
# untouched).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${here}/../.env.prod"
key_file="${here}/rules/qdrant_edrsr.key"

if [ ! -f "$env_file" ]; then
  echo "::warning::${env_file} not found — leaving qdrant_edrsr.key untouched" >&2
  exit 0
fi

# Extract the value and strip an optional single pair of surrounding quotes.
key="$(grep -hE '^QDRANT_EDRSR_API_KEY=' "$env_file" | head -1 | cut -d= -f2- || true)"
key="${key%\"}"; key="${key#\"}"
key="${key%\'}"; key="${key#\'}"

if [ -z "$key" ]; then
  echo "::warning::QDRANT_EDRSR_API_KEY empty/missing in .env.prod — leaving qdrant_edrsr.key untouched" >&2
  exit 0
fi

mkdir -p "${here}/rules"
printf '%s' "$key" > "$key_file"
chmod 644 "$key_file"
echo "Wrote ${key_file} (${#key} bytes)"
