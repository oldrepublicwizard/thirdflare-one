#!/usr/bin/env bash
# Optional CI job: install Cloudflare WARP client and verify warp-cli responds.
# Hosted GitHub runners may not run the WARP daemon; this script fails soft unless
# WARP_CI_REQUIRE_REAL=1.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRE="${WARP_CI_REQUIRE_REAL:-0}"

install_warp_deb() {
  if command -v warp-cli >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt-get not available; skipping real WARP install"
    return 1
  fi
  sudo mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg \
    | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(. /etc/os-release && echo "${VERSION_CODENAME:-$(lsb_release -cs)}") main" \
    | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
  sudo apt-get update
  sudo apt-get install -y cloudflare-warp
}

soft_fail() {
  echo "$1"
  if [[ "$REQUIRE" == "1" ]]; then
    exit 1
  fi
  echo "Skipping real WARP smoke (set WARP_CI_REQUIRE_REAL=1 to enforce)."
  exit 0
}

if ! install_warp_deb; then
  soft_fail "Could not install cloudflare-warp package."
fi

if ! command -v warp-cli >/dev/null 2>&1; then
  soft_fail "warp-cli not on PATH after install."
fi

if ! warp-cli --accept-tos status >/tmp/warp-status.txt 2>&1; then
  soft_fail "warp-cli status failed (daemon likely unavailable on this runner)."
fi

echo "Real warp-cli status:"
cat /tmp/warp-status.txt

# Run integration tests against real warp-cli when available.
export WARP_CLI=warp-cli
export CI_TEST_PORT=14734
node --test "${ROOT}/scripts/ci-warp-integration.test.mjs"
