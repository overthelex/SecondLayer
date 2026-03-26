#!/usr/bin/env bash
# preserve-proprietary-dist.sh
#
# Preserves proprietary dist files during `npm run build`.
# The public repo contains stub .ts sources for proprietary services.
# `tsc` compiles them into stub .js files, overwriting the real implementations.
# This script backs up real dist files before build and restores them after.
#
# Usage:
#   ./scripts/preserve-proprietary-dist.sh backup   # before npm run build
#   ./scripts/preserve-proprietary-dist.sh restore  # after npm run build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIST="$REPO_ROOT/mcp_backend/dist"
BACKUP_DIR="$REPO_ROOT/.proprietary-dist-backup"

# All proprietary files (stubs in source, real implementations in dist)
PROPRIETARY_FILES=(
  # services/
  "services/billing-service.js"
  "services/chat-intent-classifier.js"
  "services/chat-search-cache-service.js"
  "services/chat-service.js"
  "services/chat-context-builder.js"
  "services/chat-result-compactor.js"
  "services/chat-constants.js"
  "services/citation-validator.js"
  "services/credit-service.js"
  "services/evidence-extractor.js"
  "services/hallucination-guard.js"
  "services/legal-pattern-store.js"
  "services/pricing-service.js"
  "services/query-planner.js"
  "services/semantic-sectionizer.js"
  "services/shepardization-service.js"
  "services/subscription-service.js"
  "services/thinking-descriptions.js"
  # prompts/
  "prompts/chat-system-prompt.js"
  "prompts/query-type-config.js"
  "prompts/prompt-sections.js"
  "prompts/tool-registry-catalog.js"
  # factories/
  "factories/core-loader.js"
)

backup() {
  if [ ! -d "$BACKEND_DIST" ]; then
    echo "[preserve-dist] No dist/ directory found, nothing to backup"
    exit 0
  fi

  rm -rf "$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"

  local count=0
  for file in "${PROPRIETARY_FILES[@]}"; do
    local src="$BACKEND_DIST/$file"
    local map="$BACKEND_DIST/${file}.map"
    if [ -f "$src" ]; then
      mkdir -p "$BACKUP_DIR/$(dirname "$file")"
      cp "$src" "$BACKUP_DIR/$file"
      [ -f "$map" ] && cp "$map" "$BACKUP_DIR/${file}.map"
      count=$((count + 1))
    fi
  done

  echo "[preserve-dist] Backed up $count proprietary dist files"
}

restore() {
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "[preserve-dist] No backup found, nothing to restore"
    exit 0
  fi

  local count=0
  for file in "${PROPRIETARY_FILES[@]}"; do
    local bak="$BACKUP_DIR/$file"
    local map="$BACKUP_DIR/${file}.map"
    if [ -f "$bak" ]; then
      mkdir -p "$BACKEND_DIST/$(dirname "$file")"
      cp "$bak" "$BACKEND_DIST/$file"
      [ -f "$map" ] && cp "$map" "$BACKEND_DIST/${file}.map"
      count=$((count + 1))
    fi
  done

  rm -rf "$BACKUP_DIR"
  echo "[preserve-dist] Restored $count proprietary dist files"
}

case "${1:-}" in
  backup)  backup  ;;
  restore) restore ;;
  *)
    echo "Usage: $0 {backup|restore}"
    exit 1
    ;;
esac
