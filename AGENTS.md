# Repository Guidelines

## Project

**ThirdFlare One** — unofficial third-party Cloudflare One client (`thirdflare` npm package). Wraps host `warp-cli` through a Node daemon and optional Web UI. GitHub repository: `oldrepublicwizard/thirdflare-one`.

## Project Structure

- `server.js` — HTTP API and guarded `warp-cli` execution.
- `lib/config.mjs` — layered configuration (system, user, env, session).
- `lib/version.mjs` — installed semver from `package.json`.
- `lib/update/` — GitHub/manifest update engine and AppImage apply.
- `lib/killswitch/` — nftables kill-switch rules and privileged apply (`nft` / `pkexec`).
- `config/config.example.json` — documented defaults.
- `config/update-manifest.json` — stable/beta pointers for client update checks.
- `public/` — optional Web UI (off by default for systemd daemon); `i18n.js` + `locales/`.
- `bin/thirdflare` — primary launcher (`bin/cloudflare-one-gui` legacy alias).
- `packaging/` — FHS staging, nfpm, AppImage, Flatpak, Snap, systemd units.
- `docs/CONFIGURATION.md`, `docs/ARCHITECTURE.md`, `docs/PACKAGING.md`, `docs/UPDATES.md`, `docs/CI.md`.
- `STRATEGY.md` — product strategy (control-plane CI, consumer-basic Account).
- `scripts/mock-warp-cli.mjs` — portable stateful mock for Plane M CI.
- `openapi/thirdflare-api.json` — HTTP contract for OpenAPI checks.

## Commands

- `npm run dev` — server with `THIRDFLARE_WEBUI=1`.
- `npm run check` — syntax including config, update modules, and UI.
- `npm run test:integration` — mock warp-cli integration tests.
- `npm run test:mock-warp` — stateful mock CLI unit tests.
- `npm run test:openapi` — live response checks vs OpenAPI.
- `npm run test:update` — update engine unit tests (mocked GitHub).
- `npm run test:notify` — desktop notification / status transition tests.
- `npm run test:registration` — registration parser unit tests.
- `npm run test:killswitch` — nftables kill-switch rule generation tests.
- `npm run test:ui` — Playwright UI smoke (mock daemon).
- `npm run test:all` — all Plane M Node test suites (not Playwright).
- `npm run test:warp:real` — Plane R real WARP smoke (Linux; soft-skip unless required).
- `./bin/thirdflare` / `./bin/thirdflare --version` — launcher.
- `npm run package:*` — see `docs/PACKAGING.md`.

## Conventions

2-space indent; `camelCase` in JS; `kebab-case` for filenames. Conventional Commits for release-please.

## Testing

Run `npm run check` and `npm run test:all` before handoff. See **[docs/CI.md](docs/CI.md)** for Plane M vs Plane R. After packaging changes: `npm run package:stage` and `npm run package:deb`. Smoke `/api/health`, `/api/version`, `/api/account`, `/api/killswitch`, and `/api/update/check` after related work. See `docs/UPDATES.md` for the release → manifest pipeline.

## Learned User Preferences

- Use the product name **ThirdFlare One** in user-facing docs and UI (not bare "ThirdFlare").
- When asked to pick the next Compound Engineering step or continue, choose a skill/command/subagent and proceed autonomously without waiting for interactive confirmation.
- Update-source controls should use comboboxes for the official repo and forks, not free-text fields.
- Prefer a single state-revealing toggle for connect/disconnect-style actions over separate On/Off buttons.
- Align tooltips and account UX with Cloudflare One documentation; avoid placeholder account UI.
- UI polling/refreshes must preserve scroll position (do not jump the page to the top).

## Learned Workspace Facts

- GitHub repository is `oldrepublicwizard/thirdflare-one` (renamed from the older cloudflare-one-gui-linux name).
- Optional Web UI is off by default; settings are layered (systemd/system defaults with provisional session and in-app overrides).
- Packaging/CI targets include AppImage, deb, rpm, Flatpak, Snap, GHCR Docker images, and Homebrew. Required CI is Plane M (mock) on Linux/macOS/Windows; Plane R real WARP smoke is Ubuntu-only and optional — see `docs/CI.md`.
- Native nftables kill-switch lives under `lib/killswitch/` and is exposed via `/api/killswitch`.
- Outstanding native gaps often tracked: first-class tray packaging, self-contained native shell, polkit privilege broker, and Windows visual parity.
