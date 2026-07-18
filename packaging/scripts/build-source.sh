#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${PACKAGE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
OUT="${ROOT}/dist/packages"

mkdir -p "$OUT"
export PACKAGE_VERSION="$VERSION"
bash "${ROOT}/packaging/scripts/stage-payload.sh"

tar -C "${ROOT}/dist/payload" -czf "${OUT}/thirdflare-one-${VERSION}.tar.gz" .
# Source tree for AUR / manual builds.
tar -C "$ROOT" \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='node_modules' \
  --exclude='agentdecompile_projects' \
  --exclude='packaging/flatpak/.flatpak-builder' \
  --exclude='packaging/flatpak/repo' \
  --exclude='packaging/flatpak/build' \
  --exclude='*.AppImage' \
  -czf "${OUT}/thirdflare-one-${VERSION}-src.tar.gz" \
  server.js package.json LICENSE README.md CHANGELOG.md AGENTS.md \
  lib config public assets bin scripts packaging docs thirdflare-one

echo "Built source archives in ${OUT}"
