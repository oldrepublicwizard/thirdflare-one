---
title: "feat: Cross-OS CI confidence + basic Account"
type: feat
status: completed
date: 2026-07-18
origin: none
---

# feat: Cross-OS CI confidence + basic Account

## Summary

Ship a dual-plane CI system (Plane M mock contract on Linux/macOS/Windows; Plane R real WARP smoke on Ubuntu) and simplify Account UI to a consumer-basic surface CI can prove.

## Problem Frame

CI only ran on Ubuntu with a success-echo bash mock, so Win/Mac could not gate the control plane. Account UI was too rich (Free/ZT dual path + portal wizard) for hermetic verification. Stakeholders equated “green CI” with live tunnel success on every OS — that claim is false on GitHub-hosted runners.

## Requirements

- **R1.** Required CI on push/PR runs Plane M on `ubuntu-latest`, `macos-latest`, and `windows-latest` with a portable stateful mock `warp-cli`.
- **R2.** Exhaustive mock integration covers allow-listed actions, modes, protocols, families, MASQUE options, and split/trusted/DNS mutations with snapshot assertions.
- **R3.** OpenAPI contract file exists; live mock-server responses are validated in CI.
- **R4.** Thin UI smoke proves Home connect toggle and Account register against the mock daemon.
- **R5.** Plane R on Ubuntu (`push` to `main` / dispatch): connect/disconnect; primary oracle `cdn-cgi/trace` (`warp=on`/`off`); secondary multi-provider IP including `ifconfig.me`; soft-skip unless `WARP_CI_REQUIRE_REAL=1`.
- **R6.** Account UI is consumer-basic (status, register, license, danger zone); Zero Trust team/token under Advanced only — no portal wizard.
- **R7.** Docs state honest confidence levels (`STRATEGY.md`, `docs/CI.md`, AGENTS/ARCHITECTURE/README).
- **R8.** Kill-switch apply never runs as a required check on shared runners (rules-only unit tests OK).

## Key Technical Decisions

- **Dual CI planes:** Plane M = merge gate; Plane R = optional/network — never conflate badges.
- **Stateful Node mock:** `scripts/mock-warp-cli.mjs` with `MOCK_WARP_STATE`; server spawns `.mjs` via `node`.
- **Connectivity oracle:** Prefer `cdn-cgi/trace` over IP-only; IP delta is secondary.
- **UI smoke:** Playwright library script (`scripts/ui-smoke.mjs`) rather than flaky runner+webServer on unsupported hosts.
- **Account cut:** Keep API ZT actions; shrink UI to basic + collapsed Advanced.

## Implementation Units

### U1. Strategy + CI docs

**Goal:** Document Plane M/R and product strategy.
**Files:** `STRATEGY.md`, `docs/CI.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `README.md`
**Test expectation:** none — docs only
**Verification:** Docs describe confidence levels without claiming multi-OS live WARP.

### U2. Stateful portable mock

**Goal:** Cross-OS mock CLI with persistent connection/mode/registration/split state.
**Files:** `scripts/mock-warp-cli.mjs`, `scripts/mock-warp-cli.sh`, `scripts/mock-warp-cli.cmd`, `scripts/ci-mock-warp.test.mjs`, `server.js`
**Test scenarios:**
- Connect flips status Connected; disconnect restores Disconnected
- Mode/protocol persist in settings list
- Split IP add/list/reset
- Registration delete then new

### U3. Exhaustive integration + OpenAPI

**Goal:** Full action matrix + contract validation.
**Files:** `scripts/ci-warp-integration.test.mjs`, `openapi/thirdflare-api.json`, `scripts/ci-openapi.test.mjs`, `package.json`
**Test scenarios:**
- Every simple ACTIONS key returns 200
- Every MODES/PROTOCOLS/FAMILIES/MASQUE_OPTIONS value succeeds
- Split/trusted/DNS add-remove reflected in snapshot
- OpenAPI required fields present on health/version/account/snapshot/killswitch/config/action

### U4. Account UI basic

**Goal:** Single basic Account panel.
**Files:** `public/app.js`, `public/locales/en.json`
**Test scenarios:** UI smoke finds `data-testid=account-register`; register click keeps status strip

### U5. Cross-OS workflow + Plane R + UI smoke

**Goal:** Rewrite CI DAG; upgrade real smoke; UI job.
**Files:** `.github/workflows/ci.yml`, `scripts/ci-real-warp-smoke.sh`, `scripts/ui-smoke.mjs`, `playwright.config.mjs`, `e2e/`, `package.json`, `package-lock.json`
**Test scenarios:**
- `npm run test:all` green locally
- `npm run test:ui` green locally
- Plane R soft-skips when daemon missing

## Scope Boundaries

**In scope:** Dual-plane CI, mock exhaustiveness, OpenAPI, basic Account, UI smoke, docs.
**Out of scope:** Self-hosted required WARP gate; ZT browser SSO E2E; kill-switch apply on GHA; claiming Win/Mac nftables parity.

## Risks

| Risk | Mitigation |
|------|------------|
| Real WARP unavailable on GHA | Soft-skip; Plane M is the required gate |
| Playwright download flaky | Prefer system Chromium locally; CI installs bundled |
| Windows spawn of mock | `.mjs` via `process.execPath` in server |

## Verification

- `npm run check` && `npm run test:all` && `npm run test:ui`
- CI matrix green on PR; Plane R may continue-on-error
