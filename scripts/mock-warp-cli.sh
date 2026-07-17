#!/usr/bin/env bash
# CI mock for warp-cli — simulates daemon responses for integration tests.
set -euo pipefail

# Parse global flags in this shell (not a subshell) so JSON/LISTEN stick.
ARGS=()
JSON=0
LISTEN=0
while (($#)); do
  case "$1" in
    --no-ansi|--no-paginate|--accept-tos) shift ;;
    --json) JSON=1; shift ;;
    --listen) LISTEN=1; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

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
      if [[ "$JSON" -eq 1 ]]; then
        cat <<'EOF'
{
  "id": "mock-device-id",
  "device_id": "mock-device-id",
  "public_key": "mock-public-key",
  "managed": false,
  "account": {
    "type": "free",
    "id": "mock-account-id",
    "license": "MOCKKEY1-MOCKKEY2-MOCKKEY3"
  },
  "alternate_networks": []
}
EOF
      else
        cat <<'EOF'
Account type: Free
ID: mock-device-id
Device ID: mock-device-id
Public key: mock-public-key
Account ID: mock-account-id
License: MOCKKEY1-MOCKKEY2-MOCKKEY3
EOF
      fi
    elif [[ "$SUB" == "organization" ]]; then
      if [[ "$JSON" -eq 1 ]]; then
        echo '{"organization":""}'
      else
        echo "Organization:"
      fi
    elif [[ "$SUB" == "devices" ]]; then
      if [[ "$JSON" -eq 1 ]]; then
        cat <<'EOF'
[
  {
    "device_id": "mock-device-id",
    "os": "Linux",
    "name": "ci-host",
    "model": "Mock Hardware",
    "active": true
  }
]
EOF
      else
        echo "Device ID: mock-device-id"
        echo "OS: Linux"
        echo "Name: ci-host"
        echo "Active: true"
      fi
    elif [[ "$SUB" == "new" || "$SUB" == "license" || "$SUB" == "token" || "$SUB" == "delete" ]]; then
      echo "Success"
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
