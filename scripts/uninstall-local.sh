#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/common.sh
source "${ROOT}/scripts/lib/common.sh"

INSTALL_DIR="$(thirdflare_default_install_dir)"
LOCAL_BIN="$(thirdflare_local_bin_dir)"
APPLICATIONS_DIR="$(thirdflare_applications_dir)"
SYSTEMD_USER_DIR="$(thirdflare_systemd_user_dir)"
REMOVE_TREE=0

usage() {
  cat <<USAGE
Remove a local ThirdFlare One user install.

Usage:
  $(basename "$0") [options]

Options:
  --install-dir PATH   Install root to remove (default: ~/.local/share/thirdflare-one)
  --purge              Also delete the install tree
  -h, --help           Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --purge)
      REMOVE_TREE=1
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

for unit in thirdflare-one.service thirdflare.service cloudflare-one-gui.service; do
  if systemctl --user --quiet is-active "$unit" >/dev/null 2>&1; then
    systemctl --user stop "$unit" || true
  fi
  if systemctl --user --quiet is-enabled "$unit" >/dev/null 2>&1; then
    systemctl --user disable "$unit" || true
  fi
  rm -f "${SYSTEMD_USER_DIR}/${unit}"
done

thirdflare_remove_legacy_desktop_entries "$APPLICATIONS_DIR"

for link in thirdflare thirdflare-one thirdflare-one-tray; do
  rm -f "${LOCAL_BIN}/${link}"
done

if [[ "$REMOVE_TREE" -eq 1 && -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "Removed install tree ${INSTALL_DIR}"
fi

if systemctl --user daemon-reload >/dev/null 2>&1; then
  echo "Reloaded user systemd manager."
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

echo "Removed ThirdFlare One user integration."
