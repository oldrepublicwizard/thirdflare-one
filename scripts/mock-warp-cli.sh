#!/usr/bin/env bash
# Thin wrapper — prefer scripts/mock-warp-cli.mjs directly via WARP_CLI.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "${ROOT}/mock-warp-cli.mjs" "$@"
