class ThirdflareOne < Formula
  desc "ThirdFlare One — unofficial Cloudflare One client via warp-cli"
  homepage "https://github.com/oldrepublicwizard/thirdflare-one"
  url "https://github.com/oldrepublicwizard/thirdflare-one/releases/download/v0.2.6/thirdflare-one-0.2.6-src.tar.gz"
  sha256 "12d49b7082eee86b55b802025b00453a329d4dbea247acbe8eb5b23430a15d30"
  license "MIT"

  depends_on "node@20"

  def install
    libexec.install "server.js", "package.json", "public", "assets", "scripts", "bin", "LICENSE", "README.md"
    (bin/"thirdflare-one").write <<~EOS
      #!/bin/bash
      export PATH="#{Formula["node@20"].bin}:$PATH"
      exec "#{libexec}/bin/thirdflare" "$@"
    EOS
    chmod 0755, bin/"thirdflare-one"
  end

  def caveats
    <<~EOS
      Requires Cloudflare WARP (warp-cli) installed separately on macOS.
      Launch with: thirdflare-one --no-open
    EOS
  end

  test do
    assert_match "ThirdFlare One", shell_output("#{bin}/thirdflare-one --help")
  end
end
