class CloudflareOneGui < Formula
  desc "Desktop-style GUI for Cloudflare WARP via warp-cli"
  homepage "https://github.com/oldrepublicwizard/cloudflare-one-gui-linux"
  url "https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/releases/download/v0.2.3/cloudflare-one-gui-0.2.3-src.tar.gz"
  sha256 "4907bc39fd0b2e8ab7bbbf0bdb49b9bf1699b4ec9dd61ef8b752ec3acc098e63"
  license "MIT"

  depends_on "node@20"

  def install
    libexec.install "server.js", "package.json", "public", "assets", "scripts", "bin", "LICENSE", "README.md"
    (bin/"cloudflare-one-gui").write <<~EOS
      #!/bin/bash
      export PATH="#{Formula["node@20"].bin}:$PATH"
      exec "#{libexec}/bin/cloudflare-one-gui" "$@"
    EOS
    chmod 0755, bin/"cloudflare-one-gui"
  end

  def caveats
    <<~EOS
      Requires Cloudflare WARP (warp-cli) installed separately on macOS.
      Launch with: cloudflare-one-gui --no-open
    EOS
  end

  test do
    assert_match "Cloudflare One GUI", shell_output("#{bin}/cloudflare-one-gui --help")
  end
end
