#!/bin/bash
set -euo pipefail

# Sets up a minimal APT repository structure for hosting .deb packages
# Can be hosted on GitHub Pages, S3, or any static file server

REPO_DIR="${1:-apt-repo}"
GPG_KEY="${GPG_KEY:-}"

echo "Setting up APT repository in ${REPO_DIR}..."

mkdir -p "${REPO_DIR}/conf"
mkdir -p "${REPO_DIR}/pool/main"

# Reprepro configuration
cat > "${REPO_DIR}/conf/distributions" <<EOF
Origin: SecondLayer
Label: SecondLayer Legal Tools
Codename: stable
Architectures: amd64
Components: main
Description: CLI tools for legal.org.ua
${GPG_KEY:+SignWith: ${GPG_KEY}}
EOF

cat > "${REPO_DIR}/conf/options" <<EOF
verbose
basedir ${REPO_DIR}
EOF

echo ""
echo "APT repository structure created."
echo ""
echo "To add a package:"
echo "  reprepro -b ${REPO_DIR} includedeb stable legalua_0.1.0_amd64.deb"
echo ""
echo "To install on client machines:"
echo "  # Add GPG key"
echo "  curl -fsSL https://legal.org.ua/apt/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/legalua.gpg"
echo "  # Add repository"
echo "  echo 'deb [signed-by=/usr/share/keyrings/legalua.gpg] https://legal.org.ua/apt stable main' | sudo tee /etc/apt/sources.list.d/legalua.list"
echo "  # Install"
echo "  sudo apt update && sudo apt install legalua"
