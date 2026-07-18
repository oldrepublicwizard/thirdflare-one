#!/usr/bin/env bash
# Idempotent user install to a stable path (~/.local/share/thirdflare-one by default).
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
source "${ROOT}/scripts/lib/common.sh"

INSTALL_DIR="$(thirdflare_default_install_dir)"
LOCAL_BIN="$(thirdflare_local_bin_dir)"
APPLICATIONS_DIR="$(thirdflare_applications_dir)"
SYSTEMD_USER_DIR="$(thirdflare_systemd_user_dir)"
DESKTOP_FILE="${APPLICATIONS_DIR}/thirdflare-one.desktop"
SERVICE_FILE="${SYSTEMD_USER_DIR}/thirdflare-one.service"
WITH_DESKTOP=1
WITH_SERVICE=0
WITH_BIN_LINKS=1

usage() {
  cat <<USAGE
Install ThirdFlare One for the current user (idempotent).

Default layout:
  App tree:  \$THIRDFLARE_ONE_HOME or ~/.local/share/thirdflare-one
  CLI links: ~/.local/bin/{thirdflare,thirdflare-one,thirdflare-one-tray}
  Desktop:   ~/.local/share/applications/thirdflare-one.desktop
  Service:   ~/.config/systemd/user/thirdflare-one.service (optional)

Usage:
  $(basename "$0") [options]

Options:
  --install-dir PATH   Override install root (also THIRDFLARE_ONE_HOME)
  --desktop            Install desktop entry (default)
  --no-desktop         Skip desktop entry
  --service            Install/refresh user systemd unit
  --no-bin-links       Skip ~/.local/bin symlinks
  -h, --help           Show this help

Examples:
  $(basename "$0")
  $(basename "$0") --service
  THIRDFLARE_ONE_HOME=\$HOME/apps/thirdflare-one $(basename "$0")
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --desktop)
      WITH_DESKTOP=1
      shift
      ;;
    --no-desktop)
      WITH_DESKTOP=0
      shift
      ;;
    --service)
      WITH_SERVICE=1
      shift
      ;;
    --no-bin-links)
      WITH_BIN_LINKS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

thirdflare_require_command rsync
thirdflare_require_command node

RSYNC_EXCLUDES=(
  --exclude '.git/'
  --exclude 'node_modules/'
  --exclude 'dist/'
  --exclude 'agentdecompile_projects/'
  --exclude '.cursor/'
  --exclude '.tmp-*'
)

echo "Installing ThirdFlare One $(thirdflare_version) to ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${ROOT}/" "${INSTALL_DIR}/"

if [[ "$WITH_BIN_LINKS" -eq 1 ]]; then
  mkdir -p "$LOCAL_BIN"
  thirdflare_link_or_copy "${INSTALL_DIR}/bin/thirdflare" "${LOCAL_BIN}/thirdflare"
  thirdflare_link_or_copy "${INSTALL_DIR}/bin/thirdflare" "${LOCAL_BIN}/thirdflare-one"
  thirdflare_link_or_copy "${INSTALL_DIR}/bin/thirdflare-tray" "${LOCAL_BIN}/thirdflare-one-tray"
  echo "Linked CLI commands in ${LOCAL_BIN}"
fi

if [[ "$WITH_DESKTOP" -eq 1 ]]; then
  mkdir -p "$APPLICATIONS_DIR"
  thirdflare_remove_legacy_desktop_entries "$APPLICATIONS_DIR"

  cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=ThirdFlare One
Comment=Unofficial cross-platform Cloudflare One client
Exec=${INSTALL_DIR}/bin/thirdflare
Icon=${INSTALL_DIR}/assets/thirdflare.svg
Terminal=false
Categories=Network;
Keywords=Cloudflare;WARP;Zero Trust;ThirdFlare One;VPN;DNS;
StartupNotify=true
Actions=Connect;Disconnect;Toggle;Status;Tray;

[Desktop Action Connect]
Name=Connect WARP
Exec=${INSTALL_DIR}/bin/thirdflare --connect
Icon=${INSTALL_DIR}/assets/thirdflare.svg

[Desktop Action Disconnect]
Name=Disconnect WARP
Exec=${INSTALL_DIR}/bin/thirdflare --disconnect
Icon=${INSTALL_DIR}/assets/thirdflare.svg

[Desktop Action Toggle]
Name=Toggle WARP
Exec=${INSTALL_DIR}/bin/thirdflare --toggle
Icon=${INSTALL_DIR}/assets/thirdflare.svg

[Desktop Action Status]
Name=Show WARP Status
Exec=${INSTALL_DIR}/bin/thirdflare
Icon=${INSTALL_DIR}/assets/thirdflare.svg

[Desktop Action Tray]
Name=Start Tray Menu
Exec=${INSTALL_DIR}/bin/thirdflare --tray
Icon=${INSTALL_DIR}/assets/thirdflare.svg
DESKTOP
  chmod 0644 "$DESKTOP_FILE"

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
  fi
  echo "Installed desktop entry ${DESKTOP_FILE}"
fi

if [[ "$WITH_SERVICE" -eq 1 ]]; then
  mkdir -p "$SYSTEMD_USER_DIR"
  rm -f "${SYSTEMD_USER_DIR}/thirdflare.service" "${SYSTEMD_USER_DIR}/cloudflare-one-gui.service"

  cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=ThirdFlare One daemon
Documentation=file://${INSTALL_DIR}/README.md
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${HOME}/.config/thirdflare/env
Environment=THIRDFLARE_WEBUI=0
Environment=THIRDFLARE_PORT=4173
ExecStart=/usr/bin/env node ${INSTALL_DIR}/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
SERVICE

  if systemctl --user daemon-reload >/dev/null 2>&1; then
    echo "Installed ${SERVICE_FILE}"
    echo "Enable with: systemctl --user enable --now thirdflare-one.service"
  else
    echo "Installed ${SERVICE_FILE} (reload systemd later with: systemctl --user daemon-reload)"
  fi
fi

cat <<DONE

ThirdFlare One is installed.

  Launch GUI:  thirdflare-one
  API daemon:  thirdflare-one --no-open
  AppImage:    ./thirdflare-one build appimage

Install root: ${INSTALL_DIR}
DONE
