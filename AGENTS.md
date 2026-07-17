# Repository Guidelines

## Project

**ThirdFlare** — unofficial third-party Cloudflare One client (`thirdflare` npm package). Wraps host `warp-cli` through a Node daemon and optional Web UI. Repository folder name may still read `cloudflare-one-gui-linux` on GitHub until renamed.

## Project Structure

- `server.js` — HTTP API and guarded `warp-cli` execution.
- `lib/config.mjs` — layered configuration (system, user, env, session).
- `lib/version.mjs` — installed semver from `package.json`.
- `lib/update/` — GitHub/manifest update engine and AppImage apply.
- `config/config.example.json` — documented defaults.
- `config/update-manifest.json` — stable/beta pointers for client update checks.
- `public/` — optional Web UI (off by default for systemd daemon); `i18n.js` + `locales/`.
- `bin/thirdflare` — primary launcher (`bin/cloudflare-one-gui` legacy alias).
- `packaging/` — FHS staging, nfpm, AppImage, Flatpak, Snap, systemd units.
- `docs/CONFIGURATION.md`, `docs/ARCHITECTURE.md`, `docs/PACKAGING.md`, `docs/UPDATES.md`.

## Commands

- `npm run dev` — server with `THIRDFLARE_WEBUI=1`.
- `npm run check` — syntax including config, update modules, and UI.
- `npm run test:integration` — mock warp-cli integration tests.
- `npm run test:update` — update engine unit tests (mocked GitHub).
- `npm run test:all` — integration + update tests.
- `./bin/thirdflare` / `./bin/thirdflare --version` — launcher.
- `npm run package:*` — see `docs/PACKAGING.md`.

## Conventions

2-space indent; `camelCase` in JS; `kebab-case` for filenames. Conventional Commits for release-please.

## Testing

Run `npm run check`, `npm run test:integration`, and `npm run test:update` before handoff. After packaging changes: `npm run package:stage` and `npm run package:deb`. Smoke `/api/health`, `/api/version`, and `/api/update/check` after update work. See `docs/UPDATES.md` for the release → manifest pipeline.
