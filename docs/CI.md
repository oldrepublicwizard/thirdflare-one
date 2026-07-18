# CI confidence levels

ThirdFlare One CI uses two planes. A green required check **never** means “WARP tunnels traffic on every GitHub-hosted OS.”

## Plane M — Mock / contract (required)

**Runs on:** `ubuntu-latest`, `macos-latest`, `windows-latest` (push + pull_request).

**Proves:** HTTP API allow-lists, argv construction, parsers, account DTO shaping, update/notify/kill-switch *rule* units, and thin Web UI flows against a **stateful** mock `warp-cli` (`scripts/mock-warp-cli.mjs`).

**Does not prove:** Live Cloudflare tunnel, nftables apply, Zero Trust browser enrollment.

Commands locally:

```bash
export WARP_CLI="$PWD/scripts/mock-warp-cli.mjs"
npm run check
npm run test:all
npm run test:ui   # Playwright library smoke (Home connect + Account register)
```

## Plane R — Real WARP network smoke (optional)

**Runs on:** Ubuntu on `push` to `main` and `workflow_dispatch` (not required for PR merge).

**Proves (when the daemon starts):** disconnect → connect → `https://www.cloudflare.com/cdn-cgi/trace` contains `warp=on`; disconnect → not `warp=on`. Secondary multi-provider public IP probe (`ifconfig.me`, `api.ipify.org`, `ident.me`) logs a warning if the IP is unchanged when both probes succeed (primary oracle remains `cdn-cgi/trace`).

**Soft-skip:** If install/daemon fails, exit 0 unless `WARP_CI_REQUIRE_REAL=1`.

```bash
WARP_CI_REQUIRE_REAL=1 npm run test:warp:real
```

## Hard rules

- **Never** enable the ThirdFlare kill-switch apply path on shared GitHub-hosted runners (it can brick egress).
- Kill-switch **rule generation** stays in unit tests; apply remains Linux-local / manual.
- Prefer `cdn-cgi/trace` over `ifconfig.me` alone as the connectivity oracle.
- Win/Mac required jobs cover the portable Node control plane only.

## Upgrade path

For a hard network gate on every merge, use a **self-hosted Linux runner** with Cloudflare WARP preinstalled, set `WARP_CI_REQUIRE_REAL=1`, and mark that job required — do not expect hosted `windows-latest` / `macos-latest` to run real tunnels reliably.
