#!/bin/bash
set -euo pipefail

VERSION="${1:-0.1.0}"
ARCH="amd64"
PACKAGE_NAME="legalua"
BUILD_DIR="$(mktemp -d)"
BIN_SRC="bin/legal-linux-x64"

if [ ! -f "$BIN_SRC" ]; then
  echo "Error: Binary not found at $BIN_SRC"
  echo "Run 'npm run build:bin:linux' first"
  exit 1
fi

echo "Building .deb package v${VERSION}..."

# Create directory structure
mkdir -p "${BUILD_DIR}/DEBIAN"
mkdir -p "${BUILD_DIR}/usr/bin"
mkdir -p "${BUILD_DIR}/usr/share/doc/${PACKAGE_NAME}"
mkdir -p "${BUILD_DIR}/usr/share/man/man1"

# Copy binary
cp "$BIN_SRC" "${BUILD_DIR}/usr/bin/legal"
chmod 755 "${BUILD_DIR}/usr/bin/legal"

# Control file
cat > "${BUILD_DIR}/DEBIAN/control" <<EOF
Package: ${PACKAGE_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: SecondLayer <info@legal.org.ua>
Homepage: https://legal.org.ua
Description: CLI для роботи з legal.org.ua
 Пошук судових рішень, законодавства, реєстрів України.
 Доступ до 90+ інструментів правової аналітики з командного рядка.
Depends: ca-certificates
EOF

# Copyright
cat > "${BUILD_DIR}/usr/share/doc/${PACKAGE_NAME}/copyright" <<EOF
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: legalua
Source: https://github.com/overthelex/SecondLayer

Files: *
Copyright: 2024-2026 SecondLayer
License: BUSL-1.1
EOF

# Build .deb
DEB_FILE="${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --build "$BUILD_DIR" "$DEB_FILE"

echo "Built: $DEB_FILE"

# Cleanup
rm -rf "$BUILD_DIR"
