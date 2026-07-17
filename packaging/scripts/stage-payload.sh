#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${PACKAGE_VERSION:-$(node -p "require('${ROOT}/package.json').version")}"
DIST="${ROOT}/dist"
PAYLOAD="${DIST}/payload"
LIB="${PAYLOAD}/usr/lib/thirdflare"

rm -rf "$PAYLOAD"
mkdir -p \
  "$LIB" \
  "${LIB}/lib" \
  "${PAYLOAD}/usr/bin" \
  "${PAYLOAD}/usr/share/applications" \
  "${PAYLOAD}/usr/share/icons/hicolor/scalable/apps" \
  "${PAYLOAD}/usr/lib/systemd/user" \
  "${PAYLOAD}/usr/share/doc/thirdflare" \
  "${PAYLOAD}/usr/share/licenses/thirdflare" \
  "${PAYLOAD}/etc/thirdflare" \
  "${PAYLOAD}/etc/default"

install -m 0644 "${ROOT}/server.js" "${LIB}/server.js"
install -m 0644 "${ROOT}/package.json" "${LIB}/package.json"
mkdir -p "${LIB}/lib/update" "${LIB}/config"
install -m 0644 "${ROOT}/lib/config.mjs" "${LIB}/lib/config.mjs"
install -m 0644 "${ROOT}/lib/version.mjs" "${LIB}/lib/version.mjs"
install -m 0644 "${ROOT}/lib/update/semver.mjs" "${LIB}/lib/update/semver.mjs"
install -m 0644 "${ROOT}/lib/update/github.mjs" "${LIB}/lib/update/github.mjs"
install -m 0644 "${ROOT}/lib/update/manifest.mjs" "${LIB}/lib/update/manifest.mjs"
install -m 0644 "${ROOT}/lib/update/detect-format.mjs" "${LIB}/lib/update/detect-format.mjs"
install -m 0644 "${ROOT}/lib/update/apply-appimage.mjs" "${LIB}/lib/update/apply-appimage.mjs"
install -m 0644 "${ROOT}/lib/update/index.mjs" "${LIB}/lib/update/index.mjs"
install -m 0644 "${ROOT}/config/config.example.json" "${PAYLOAD}/etc/thirdflare/config.json.example"
install -m 0644 "${ROOT}/config/update-manifest.json" "${LIB}/config/update-manifest.json"
install -m 0644 "${ROOT}/packaging/thirdflare.default" "${PAYLOAD}/etc/default/thirdflare"
install -m 0644 "${ROOT}/README.md" "${PAYLOAD}/usr/share/doc/thirdflare/README.md"
install -m 0644 "${ROOT}/LICENSE" "${PAYLOAD}/usr/share/licenses/thirdflare/LICENSE"
install -m 0644 "${ROOT}/CHANGELOG.md" "${PAYLOAD}/usr/share/doc/thirdflare/CHANGELOG.md"

cp -a "${ROOT}/public" "${LIB}/public"
cp -a "${ROOT}/assets" "${LIB}/assets"
mkdir -p "${LIB}/scripts" "${LIB}/bin"
install -m 0755 "${ROOT}/scripts/health-check.mjs" "${LIB}/scripts/health-check.mjs"
install -m 0755 "${ROOT}/scripts/port-open.mjs" "${LIB}/scripts/port-open.mjs"
install -m 0755 "${ROOT}/bin/thirdflare" "${LIB}/bin/thirdflare"
install -m 0755 "${ROOT}/bin/thirdflare-tray" "${LIB}/bin/thirdflare-tray"
install -m 0755 "${ROOT}/bin/cloudflare-one-gui" "${LIB}/bin/cloudflare-one-gui"
install -m 0755 "${ROOT}/bin/cloudflare-one-tray" "${LIB}/bin/cloudflare-one-tray"

install -m 0755 "${ROOT}/packaging/usr-bin-wrapper.sh" "${PAYLOAD}/usr/bin/thirdflare"
install -m 0755 "${ROOT}/packaging/usr-bin-legacy-wrapper.sh" "${PAYLOAD}/usr/bin/cloudflare-one-gui"
install -m 0644 "${ROOT}/packaging/thirdflare.desktop" \
  "${PAYLOAD}/usr/share/applications/thirdflare.desktop"
install -m 0644 "${ROOT}/assets/thirdflare.svg" \
  "${PAYLOAD}/usr/share/icons/hicolor/scalable/apps/thirdflare.svg"
install -m 0644 "${ROOT}/packaging/thirdflare.service" \
  "${PAYLOAD}/usr/lib/systemd/user/thirdflare.service"
install -m 0644 "${ROOT}/packaging/cloudflare-one-gui.service" \
  "${PAYLOAD}/usr/lib/systemd/user/cloudflare-one-gui.service"

printf '%s\n' "$VERSION" > "${DIST}/VERSION"
echo "Staged payload at ${PAYLOAD} (version ${VERSION})"
