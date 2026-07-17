#!/usr/bin/env bash
# CI mock for warp-cli — simulates daemon responses for integration tests.
set -euo pipefail

strip_global_flags() {
  local args=()
  while (($#)); do
    case "$1" in
      --no-ansi|--no-paginate) shift ;;
      --listen) LISTEN=1; shift ;;
      *) args+=("$1"); shift ;;
    esac
  done
  printf '%s\n' "${args[@]:-}"
}

LISTEN=0
mapfile -t ARGS < <(strip_global_flags "$@")
CMD="${ARGS[0]:-status}"
SUB="${ARGS[1]:-}"
SUB2="${ARGS[2]:-}"

if [[ "$LISTEN" -eq 1 && "$CMD" == "status" ]]; then
  printf 'Status update: Connected\n'
  printf 'Network: healthy\n'
  while true; do sleep 3600; done
fi

case "$CMD" in
  status)
    cat <<'EOF'
Status update: Disconnected
Network: healthy
EOF
    ;;
  settings)
    if [[ "$SUB" == "list" ]]; then
      cat <<'EOF'
Mode: warp
Gateway ID: mock-gateway-id
Support URL: https://example.com/support
EOF
    elif [[ "$SUB" == "support-url" ]]; then
      echo "https://example.com/support"
    elif [[ "$SUB" == "mode-switch-allowed" ]]; then
      echo "true"
    else
      echo "ok"
    fi
    ;;
  registration)
    if [[ "$SUB" == "show" ]]; then
      echo "Registration: mock-device"
    elif [[ "$SUB" == "organization" ]]; then
      echo "Organization: mock-org"
    else
      echo "ok"
    fi
    ;;
  connect|disconnect)
    echo "Success"
    ;;
  stats)
    echo "Bytes sent: 0"
    ;;
  tunnel)
    case "$SUB" in
      stats) echo "Tunnel bytes: 0" ;;
      dump) echo "Tunnel dump: mock" ;;
      ip)
        [[ "$SUB2" == "list" ]] && echo "10.0.0.0/8" || echo "ok"
        ;;
      host)
        [[ "$SUB2" == "list" ]] && echo "example.com" || echo "ok"
        ;;
      *) echo "ok" ;;
    esac
    ;;
  dns)
    case "$SUB" in
      stats) echo "DNS queries: 0" ;;
      fallback)
        [[ "$SUB2" == "list" ]] && echo "1.1.1.1" || echo "ok"
        ;;
      log)
        echo "ok"
        ;;
      *) echo "ok" ;;
    esac
    ;;
  target)
    [[ "$SUB" == "list" ]] && echo "mock-target" || echo "ok"
    ;;
  vnet)
    echo "mock-vnet"
    ;;
  mdm)
    echo "mock-mdm"
    ;;
  override)
    echo "override: none"
    ;;
  trusted)
    echo "ok"
    ;;
  debug)
    case "$SUB" in
      network)
        cat <<'EOF'
Interface: eth0
DNS servers: 1.1.1.1, 1.0.0.1
Resolver: systemd-resolved
Connectivity: ok
EOF
        ;;
      posture) echo "posture: ok" ;;
      alternate-network) echo "alternate: none" ;;
      dex) echo "dex: ok" ;;
      access-reauth) echo "ok" ;;
      *) echo "ok" ;;
    esac
    ;;
  certs)
    echo "mock-cert"
    ;;
  proxy)
    echo "ok"
    ;;
  environment)
    echo "ok"
    ;;
  *)
    echo "ok"
    ;;
esac
