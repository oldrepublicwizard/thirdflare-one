#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${PACKAGE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
OUT="${ROOT}/dist/packages"
MANIFEST="${ROOT}/packaging/flatpak/io.github.cloudflare_one_gui_linux.CloudflareOneGui.yml"
BUILD_DIR="${ROOT}/packaging/flatpak/build"
REPO_DIR="${ROOT}/packaging/flatpak/repo"
APP_ID="io.github.cloudflare_one_gui_linux.CloudflareOneGui"
METAINFO="${ROOT}/packaging/flatpak/metainfo.xml"

mkdir -p "$OUT" "$BUILD_DIR" "$REPO_DIR"

if ! command -v flatpak-builder >/dev/null 2>&1; then
  echo "flatpak-builder is required. Install flatpak-builder and the Freedesktop 24.08 SDK." >&2
  exit 1
fi

# Ensure runtime/sdk are present (best-effort on CI).
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo || true
flatpak install -y --user flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08

# Patch metainfo release version for this build.
sed -i "s/version=\"[0-9.][0-9.]*\"/version=\"${VERSION}\"/" "$METAINFO"

flatpak-builder --force-clean --user --build-only "$BUILD_DIR" "$MANIFEST"

flatpak build-finish "$BUILD_DIR" \
  --command=cloudflare-one-gui \
  --share=network \
  --share=ipc \
  --socket=x11 \
  --socket=wayland \
  --socket=fallback-x11 \
  --device=dri \
  --filesystem=xdg-run \
  --filesystem=xdg-cache \
  --talk-name=org.freedesktop.Flatpak \
  --talk-name=org.freedesktop.Notifications

flatpak build-export --no-update-appstream "$REPO_DIR" "$BUILD_DIR"
flatpak build-bundle "$REPO_DIR" \
  "${OUT}/cloudflare-one-gui-${VERSION}-x86_64.flatpak" \
  "$APP_ID"

echo "Built ${OUT}/cloudflare-one-gui-${VERSION}-x86_64.flatpak"
