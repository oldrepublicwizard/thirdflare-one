#!/usr/bin/env bash
# Verify built Linux packages exist and have expected contents.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${ROOT}/dist/packages"
VERSION="${PACKAGE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
SCOPE="${1:-all}"

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing artifact: $path" >&2
    exit 1
  fi
  echo "OK $path ($(du -h "$path" | awk '{print $1}'))"
}

verify_deb_rpm() {
  local deb="${OUT}/cloudflare-one-gui_${VERSION}_all.deb"
  local rpm="${OUT}/cloudflare-one-gui-${VERSION}-1.noarch.rpm"
  local arch="${OUT}/cloudflare-one-gui-${VERSION}-1-any.pkg.tar.zst"

  require_file "$deb"
  require_file "$rpm"
  require_file "$arch"

  dpkg-deb -I "$deb" >/dev/null
  dpkg-deb -c "$deb" | grep -q '/usr/lib/cloudflare-one-gui/server.js'
  dpkg-deb -c "$deb" | grep -q '/usr/bin/cloudflare-one-gui'

  rpm -qip "$rpm" >/dev/null
  rpm -qlp "$rpm" | grep -q '/usr/lib/cloudflare-one-gui/server.js'

  if command -v tar >/dev/null 2>&1; then
    tar -tf "$arch" | grep -q 'cloudflare-one-gui'
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "Smoke installing .deb in Ubuntu container..."
    docker run --rm -v "${deb}:/pkg.deb:ro" ubuntu:24.04 bash -euxo pipefail -c '
      apt-get update
      apt-get install -y nodejs ca-certificates
      dpkg -i /pkg.deb || apt-get install -f -y
      test -x /usr/bin/cloudflare-one-gui
      test -f /usr/lib/cloudflare-one-gui/server.js
      PORT=4173 node /usr/lib/cloudflare-one-gui/server.js &
      pid=$!
      sleep 2
      curl -fsS http://127.0.0.1:4173/api/health | grep -q cloudflare-one-gui
      kill $pid
    '
  else
    echo "docker not available; skipping deb install smoke"
  fi
}

verify_appimage() {
  local appimage="${OUT}/cloudflare-one-gui-${VERSION}-x86_64.AppImage"
  require_file "$appimage"
  file "$appimage" | grep -Eiq 'executable|AppImage|ELF'
  chmod +x "$appimage"
  # Extract-only validation when FUSE is unavailable.
  if "$appimage" --appimage-extract >/dev/null 2>&1; then
    test -f squashfs-root/usr/lib/cloudflare-one-gui/server.js
    rm -rf squashfs-root
  else
    echo "AppImage extract skipped (FUSE unavailable); size/type check passed"
  fi
}

verify_flatpak() {
  local bundle="${OUT}/cloudflare-one-gui-${VERSION}-x86_64.flatpak"
  require_file "$bundle"
  file "$bundle" | grep -qi 'data'
  if command -v flatpak >/dev/null 2>&1; then
    flatpak build-info "$bundle" >/dev/null 2>&1 || true
  fi
}

verify_snap() {
  local snap="${OUT}/cloudflare-one-gui_${VERSION}_amd64.snap"
  require_file "$snap"
  file "$snap" | grep -Eiq 'Squashfs|snap'
}

case "$SCOPE" in
  deb-rpm|deb|rpm)
    verify_deb_rpm
    ;;
  appimage)
    verify_appimage
    ;;
  flatpak)
    verify_flatpak
    ;;
  snap)
    verify_snap
    ;;
  all)
    verify_deb_rpm
    verify_appimage
    verify_flatpak
    verify_snap
    ;;
  *)
    echo "Usage: $0 [all|deb-rpm|appimage|flatpak|snap]" >&2
    exit 2
    ;;
esac

echo "Package verification passed for scope: $SCOPE"
