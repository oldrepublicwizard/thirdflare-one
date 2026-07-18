#!/usr/bin/env bash
# Shared helpers for ThirdFlare One shell scripts.
set -euo pipefail

thirdflare_repo_root() {
  local lib_dir
  lib_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  (cd -- "${lib_dir}/../.." && pwd)
}

thirdflare_default_install_dir() {
  printf '%s\n' "${THIRDFLARE_ONE_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/thirdflare-one}"
}

thirdflare_local_bin_dir() {
  printf '%s\n' "${THIRDFLARE_ONE_BIN:-${HOME}/.local/bin}"
}

thirdflare_applications_dir() {
  printf '%s\n' "${XDG_DATA_HOME:-$HOME/.local/share}/applications"
}

thirdflare_systemd_user_dir() {
  printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
}

thirdflare_version() {
  node -p "require('$(thirdflare_repo_root)/package.json').version"
}

thirdflare_require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    return 1
  fi
}

thirdflare_link_or_copy() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [[ -e "$dst" && ! -L "$dst" ]]; then
    rm -rf "$dst"
  fi
  ln -sf "$src" "$dst"
}

thirdflare_remove_legacy_desktop_entries() {
  local apps_dir="$1"
  local names=(
    cloudflare-one-gui.desktop
    thirdflare.desktop
    thirdflare-one.desktop
  )
  local name
  for name in "${names[@]}"; do
    rm -f "${apps_dir}/${name}"
  done
}
