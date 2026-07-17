#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:-$(node -p "require('${ROOT}/package.json').version")}"
TAG="v${VERSION}"
TARBALL="${ROOT}/dist/packages/cloudflare-one-gui-${VERSION}-src.tar.gz"
OUT="${ROOT}/homebrew-tap/Formula/cloudflare-one-gui.rb"
TEMPLATE="${ROOT}/packaging/homebrew/cloudflare-one-gui.rb.in"

mkdir -p "$(dirname "$OUT")"
bash "${ROOT}/packaging/scripts/build-source.sh"
SHA256="$(sha256sum "$TARBALL" | awk '{print $1}')"
URL="https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/releases/download/${TAG}/cloudflare-one-gui-${VERSION}-src.tar.gz"

sed \
  -e "s/__VERSION__/${VERSION}/g" \
  -e "s|__URL__|${URL}|g" \
  -e "s/__SHA256__/${SHA256}/g" \
  "$TEMPLATE" > "$OUT"

echo "Generated $OUT (sha256 ${SHA256})"
