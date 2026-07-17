# Repository Guidelines

## Project Structure & Module Organization

This repository contains a local Cloudflare One / WARP GUI that wraps `warp-cli` through a small Node server and static frontend. Keep the top-level layout explicit and predictable:

- `server.js` for the local HTTP API and guarded `warp-cli` execution.
- `public/` for the desktop-style HTML, CSS, and browser UI logic.
- `bin/` for user-facing launchers.
- `scripts/` for install, uninstall, and verification helpers.
- `assets/` for icons and bundled UI resources.
- `packaging/` for FHS staging, nfpm, AppImage, Flatpak, Snap, and Arch manifests.
- `.github/workflows/` for CI, release-please, and package upload jobs.
- `docs/PACKAGING.md` for packaging and release documentation.

Avoid committing generated build output (`dist/`), local caches, `agentdecompile_projects/`, or machine-specific configuration.

## Build, Test, and Development Commands

Use the npm scripts from the repository root:

- `npm run dev` starts the local GUI server on `127.0.0.1:4173`.
- `npm run check` syntax-checks `server.js`, `public/app.js`, `public/service-worker.js`, `scripts/health-check.mjs`, `scripts/port-open.mjs`, and `scripts/ci-warp-integration.test.mjs`.
- `npm run test:integration` runs mock warp-cli HTTP integration tests (DNS + `/api/snapshot` + `/api/action`).
- `npm run package:stage` / `package:deb` / `package:rpm` / `package:appimage` build packaging artifacts (see `docs/PACKAGING.md`).
- `npm run package:verify` validates built `.deb`, `.rpm`, AppImage, Flatpak, and Snap artifacts.
- `./bin/cloudflare-one-gui --no-open` starts or reuses the managed server and prints the URL.
- `./bin/cloudflare-one-gui --tray` starts the optional `yad` tray menu when a desktop display is available.

Commands should be runnable from the repository root without hidden local setup beyond an installed `warp-cli`. Packaged installs require host Node 20+ (except AppImage/Flatpak, which bundle Node) and host `warp-cli`.

## Coding Style & Naming Conventions

Use 2-space indentation for JavaScript, JSON, YAML, CSS, and Markdown. Keep backend helpers small and explicit; use `camelCase` for functions and variables, uppercase constants for command maps, and kebab-case for file and directory names.

## Testing Guidelines

No full test harness exists yet. Run `npm run check` before handing off changes, then smoke-test `/api/health`, `/api/snapshot`, and at least one harmless GUI command such as `status`. Browser-check desktop and narrow viewports for layout overflow after UI changes. After packaging changes, run `npm run package:stage` and preferably `npm run package:deb`.

## Commit & Pull Request Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/) so release-please can bump versions: `feat:`, `fix:`, `docs:`, `chore:`, and `feat!:` / `BREAKING CHANGE:` for majors. Pull requests should describe the change, list verification commands, link related issues, and include screenshots or screen recordings for GUI changes.

## Agent-Specific Instructions

Before editing, check whether project files have been added since this guide was written. Do not overwrite user changes, and update this document when real structure, commands, or conventions appear.
