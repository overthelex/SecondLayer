#!/bin/bash
set -euo pipefail

# Updates the Homebrew formula with new SHA256 hashes from GitHub release
# Usage: ./update-homebrew-formula.sh v0.1.0

VERSION="${1:?Usage: $0 <version-tag>}"
VERSION_NUM="${VERSION#v}"
REPO="overthelex/SecondLayer"
TAP_DIR="${TAP_DIR:-homebrew-tap}"

echo "Updating Homebrew formula for ${VERSION}..."

# Download and compute SHA256
for platform in darwin-arm64 darwin-x64 linux-x64; do
  URL="https://github.com/${REPO}/releases/download/${VERSION}/legal-${platform}.tar.gz"
  SHA=$(curl -sL "$URL" | shasum -a 256 | cut -d' ' -f1)
  echo "${platform}: ${SHA}"

  case "$platform" in
    darwin-arm64) SHA_DARWIN_ARM64="$SHA" ;;
    darwin-x64)   SHA_DARWIN_X64="$SHA" ;;
    linux-x64)    SHA_LINUX_X64="$SHA" ;;
  esac
done

# Generate formula
cat > "${TAP_DIR}/Formula/legalua.rb" <<RUBY
class Legalua < Formula
  desc "CLI для роботи з legal.org.ua — судові рішення, законодавство, реєстри"
  homepage "https://legal.org.ua"
  version "${VERSION_NUM}"
  license "BUSL-1.1"

  on_macos do
    on_arm do
      url "https://github.com/${REPO}/releases/download/${VERSION}/legal-darwin-arm64.tar.gz"
      sha256 "${SHA_DARWIN_ARM64}"
    end
    on_intel do
      url "https://github.com/${REPO}/releases/download/${VERSION}/legal-darwin-x64.tar.gz"
      sha256 "${SHA_DARWIN_X64}"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/${REPO}/releases/download/${VERSION}/legal-linux-x64.tar.gz"
      sha256 "${SHA_LINUX_X64}"
    end
  end

  def install
    bin.install "legal"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/legal --version")
  end
end
RUBY

echo "Formula updated: ${TAP_DIR}/Formula/legalua.rb"
