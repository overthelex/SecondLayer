class Legalua < Formula
  desc "CLI для роботи з legal.org.ua — судові рішення, законодавство, реєстри"
  homepage "https://legal.org.ua"
  version "0.1.0"
  license "BUSL-1.1"

  on_macos do
    on_arm do
      url "https://github.com/overthelex/SecondLayer/releases/download/cli-v0.1.0/legal-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER"
    end
    on_intel do
      url "https://github.com/overthelex/SecondLayer/releases/download/cli-v0.1.0/legal-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/overthelex/SecondLayer/releases/download/cli-v0.1.0/legal-linux-x64.tar.gz"
      sha256 "PLACEHOLDER"
    end
  end

  def install
    bin.install "legal"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/legal --version")
  end
end
