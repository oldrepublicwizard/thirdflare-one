#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${PACKAGE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
OUT="${ROOT}/homebrew-tap/Formula/thirdflare-one.rb"
TEMPLATE="${ROOT}/packaging/homebrew/thirdflare-one.rb.in"
TARBALL="${ROOT}/dist/packages/thirdflare-one-${VERSION}-src.tar.gz"
TAG="v${VERSION}"

mkdir -p "$(dirname "$OUT")"
URL="https://github.com/oldrepublicwizard/thirdflare-one/releases/download/${TAG}/thirdflare-one-${VERSION}-src.tar.gz"
SHA256="$(sha256sum "$TARBALL" | awk '{print $1}')"

sed -e "s|__URL__|${URL}|g" -e "s|__SHA256__|${SHA256}|g" "$TEMPLATE" > "$OUT"
echo "Wrote ${OUT}"
