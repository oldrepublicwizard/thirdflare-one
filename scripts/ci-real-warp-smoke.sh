#!/usr/bin/env bash
# Plane R: install Cloudflare WARP, connect/disconnect, assert cdn-cgi/trace (+ optional IP delta).
# Soft-skips when the daemon is unavailable unless WARP_CI_REQUIRE_REAL=1.
set -euo pipefail

REQUIRE="${WARP_CI_REQUIRE_REAL:-0}"
SETTLE_SEC="${WARP_CI_SETTLE_SEC:-8}"

# Environment gaps only (install/daemon unavailable).
soft_skip() {
  echo "$1"
  if [[ "$REQUIRE" == "1" ]]; then
    exit 1
  fi
  echo "Skipping Plane R real WARP smoke (set WARP_CI_REQUIRE_REAL=1 to enforce)."
  exit 0
}

# Oracle / connectivity assertion failures after the daemon is known up.
hard_fail() {
  echo "FAIL: $1"
  exit 1
}

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
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") main" \
    | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
  sudo apt-get update
  sudo apt-get install -y cloudflare-warp
}

fetch_trace() {
  curl -4 -fsS --max-time 20 https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null || true
}

warp_on_from_trace() {
  local trace="$1"
  grep -qE '^warp=(on|plus)$' <<<"$trace"
}

fetch_public_ip() {
  local ip=""
  for url in \
    "https://ifconfig.me/ip" \
    "https://api.ipify.org" \
    "https://ident.me"; do
    ip="$(curl -4 -fsS --max-time 10 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

if ! install_warp_deb; then
  soft_skip "Could not install cloudflare-warp package."
fi

if ! command -v warp-cli >/dev/null 2>&1; then
  soft_skip "warp-cli not on PATH after install."
fi

# Ensure daemon is up
sudo systemctl enable --now warp-svc 2>/dev/null || true
sleep 2

if ! warp-cli --accept-tos status >/tmp/warp-status.txt 2>&1; then
  soft_skip "warp-cli status failed (daemon likely unavailable on this runner)."
fi

echo "Initial warp-cli status:"
cat /tmp/warp-status.txt

# Consumer registration if missing
if grep -qiE 'registration missing|not registered' /tmp/warp-status.txt; then
  echo "Registering consumer device..."
  warp-cli --accept-tos registration new || soft_skip "registration new failed."
fi

echo "Disconnecting before baseline probes..."
warp-cli --accept-tos disconnect || true
sleep "$SETTLE_SEC"

TRACE_OFF="$(fetch_trace)"
echo "Trace (expect WARP off):"
echo "$TRACE_OFF"
if warp_on_from_trace "$TRACE_OFF"; then
  hard_fail "cdn-cgi/trace still reports warp=on after disconnect."
fi

IP_OFF=""
IP_OFF="$(fetch_public_ip || true)"
echo "Public IP disconnected: ${IP_OFF:-unavailable}"

echo "Connecting WARP..."
if ! warp-cli --accept-tos connect; then
  hard_fail "warp-cli connect failed."
fi
sleep "$SETTLE_SEC"

TRACE_ON="$(fetch_trace)"
echo "Trace (expect WARP on):"
echo "$TRACE_ON"
if ! warp_on_from_trace "$TRACE_ON"; then
  hard_fail "cdn-cgi/trace did not report warp=on after connect."
fi

IP_ON=""
IP_ON="$(fetch_public_ip || true)"
echo "Public IP connected: ${IP_ON:-unavailable}"

if [[ -n "$IP_OFF" && -n "$IP_ON" && "$IP_OFF" == "$IP_ON" ]]; then
  echo "WARNING: public IP unchanged after connect (CDN/anycast may mask delta); primary oracle is cdn-cgi/trace."
elif [[ -n "$IP_OFF" && -n "$IP_ON" && "$IP_OFF" != "$IP_ON" ]]; then
  echo "Public IP changed after connect (${IP_OFF} -> ${IP_ON})."
fi

echo "Disconnecting for cleanup..."
warp-cli --accept-tos disconnect || true
sleep "$SETTLE_SEC"

TRACE_FINAL="$(fetch_trace)"
if warp_on_from_trace "$TRACE_FINAL"; then
  hard_fail "cdn-cgi/trace still reports warp=on after final disconnect."
fi

echo "Plane R real WARP smoke passed (cdn-cgi/trace)."
