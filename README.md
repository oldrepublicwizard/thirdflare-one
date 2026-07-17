# ThirdFlare

**ThirdFlare** is an unofficial, third-party reimplementation of the [Cloudflare One](https://developers.cloudflare.com/cloudflare-one/) desktop experience (formerly branded around WARP on the client). Windows ships the only official full GUI today; Linux, macOS, and headless environments get `warp-cli` without a comparable app. ThirdFlare closes that gap with **drop-in `warp-cli` compatibility** — same daemon, same settings surface, same workflows — on every OS we package.

> **Not affiliated with Cloudflare.** ThirdFlare is community software that talks to your existing WARP install. Cloudflare trademarks belong to Cloudflare, Inc.

## Why “ThirdFlare”?

Wordplay on **third-party** + **Cloudflare**. You keep the official WARP daemon; we provide the One-style control plane the other platforms never got.

## Features

- **Parity-first** — connect/disconnect, modes, Gateway DNS, split tunnel, trusted networks, registration, overrides, diagnostics, and more via guarded `warp-cli` execution.
- **Cross-platform** — Linux packages (deb, rpm, Arch, AppImage, Flatpak, Snap), macOS Homebrew, container images, and portable source builds.
- **Optional Web UI** — browser shell for the full desktop experience; **disabled by default** when the systemd daemon runs headless. Enable locally from the launcher or persistently in config.
- **Idiomatic configuration** — systemd `EnvironmentFile`, `/etc/thirdflare/config.json`, user config, environment variables, and in-app session overrides with documented precedence.
- **Safe by default** — localhost bind, redacted secrets in API output, no shell invocation of `warp-cli`, confirmation for destructive actions.
- **Updates & localization** — channel/fork-aware GitHub release checks, AppImage auto-apply, tooltips, and an `en` locale framework (see [docs/UPDATES.md](docs/UPDATES.md)).

## Requirements

| Component | Notes |
|-----------|--------|
| Cloudflare WARP | Official client with `warp-cli` on `PATH` |
| Node.js | 20+ on the host (bundled in AppImage / Flatflat / Snap where applicable) |
| Browser | For the Web UI when enabled (Firefox preferred on Linux) |

Platform install links:

- [Linux](https://developers.cloudflare.com/warp-client/get-started/linux/)
- [macOS](https://developers.cloudflare.com/warp-client/get-started/macos/)

## Quick start

```bash
# Development (Web UI enabled for localhost)
npm run dev

# Production-style launcher (opens Web UI)
./bin/thirdflare

# API-only daemon (Web UI off — default for systemd)
./bin/thirdflare --no-open
```

Open `http://127.0.0.1:4173` when the Web UI is enabled.

### CLI quick actions

```bash
thirdflare --connect
thirdflare --disconnect
thirdflare --toggle
thirdflare --warp-status
thirdflare --tray          # optional yad tray
thirdflare --version
thirdflare --status
thirdflare --stop
```

Legacy alias: `cloudflare-one-gui` → same binary.

## Configuration overview

Configuration merges in this order (low → high):

1. Built-in defaults  
2. `/etc/thirdflare/config.json`  
3. `/etc/default/thirdflare` (systemd `EnvironmentFile`)  
4. `~/.config/thirdflare/config.json`  
5. Environment variables (`THIRDFLARE_*`)  
6. In-app session overrides (`POST /api/config/session`) until daemon restart  

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for every key, systemd drop-ins, and examples.

### Optional Web UI

| Setting | Default | Meaning |
|---------|---------|---------|
| `webui.enabled` | `false` | Serve static UI + PWA shell |
| `webui.allowRemote` | `false` | Bind `0.0.0.0` when enabled (LAN access) |

The interactive launcher sets `THIRDFLARE_WEBUI=1` when opening the GUI. The systemd user service keeps the Web UI off so the daemon stays API-only until you opt in.

## systemd user service

```bash
npm run install:user-service   # writes ~/.config/systemd/user/thirdflare.service
systemctl --user enable --now thirdflare.service
```

Packaged installs also ship `/usr/lib/systemd/user/thirdflare.service` and `/etc/default/thirdflare`.

Persistent changes belong in config files or drop-ins:

```bash
systemctl --user edit thirdflare
# or edit /etc/thirdflare/config.json
```

## Architecture

ThirdFlare is a small Node HTTP server plus static Web UI that wraps `spawn('warp-cli', …)` (or `flatpak-spawn --host warp-cli` in Flatpak). Live status uses `warp-cli --listen status`; snapshots poll the same command surface as the Windows app.

Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for API routes, config module layout, and platform matrix.

## Packages & CI

Prebuilt artifacts publish on [GitHub Releases](../../releases). Formats, GHCR images, Homebrew tap, and manual workflow dispatch are documented in **[docs/PACKAGING.md](docs/PACKAGING.md)**.

```bash
gh workflow run package.yml --ref main -f publish_ghcr=true
docker pull ghcr.io/oldrepublicwizard/cloudflare-one-gui-linux:latest   # image name migrates with next release
brew tap oldrepublicwizard/cloudflare-one-gui-linux homebrew-tap
brew install cloudflare-one-gui   # formula alias; becomes thirdflare over time
```

## Roadmap gaps (honest)

| Area | Status |
|------|--------|
| Windows / native shells (Electron, Tauri, AppIndicator) | Planned — Web UI is v1 |
| CSRF token on `/api/action` | Not yet — localhost trust model |
| Persist in-app settings to `~/.config/thirdflare` | Session-only today; use config files for persistence |
| Full parity matrix vs Windows One | Tracked in-app on Parity page |

Contributions welcome — especially native platform shells and parity audits.

## License

MIT — see [LICENSE](LICENSE).
