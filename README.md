# ThirdFlare One

Unofficial [Cloudflare One](https://developers.cloudflare.com/cloudflare-one/) client for Linux, macOS, and headless environments. ThirdFlare One wraps your existing **`warp-cli`** install with a local API and optional browser UI — functional parity with the official Windows desktop app.

> **Not affiliated with Cloudflare.** Install [Cloudflare WARP](https://developers.cloudflare.com/warp-client/get-started/linux/) separately. Cloudflare trademarks belong to Cloudflare, Inc.

## Quick start

### End users

**From a [GitHub Release](https://github.com/oldrepublicwizard/thirdflare-one/releases)** — download AppImage, `.deb`, `.rpm`, Flatpak, or Snap, then launch **ThirdFlare One** from your app menu or run:

```bash
thirdflare-one
```

**From source** — clone, install to a stable path, launch:

```bash
git clone https://github.com/oldrepublicwizard/thirdflare-one.git
cd thirdflare-one
./thirdflare-one install
thirdflare-one
```

Install layout: `~/.local/share/thirdflare-one` · CLI on `~/.local/bin` · desktop entry `thirdflare-one.desktop`

**Background daemon (optional):**

```bash
./thirdflare-one install --service
systemctl --user enable --now thirdflare-one.service
```

Open **http://127.0.0.1:4173** when the Web UI is enabled.

### Developers

```bash
git clone https://github.com/oldrepublicwizard/thirdflare-one.git
cd thirdflare-one
npm install

export WARP_CLI="$PWD/scripts/mock-warp-cli.mjs"
npm run check
npm run test:all
npm run dev                    # Web UI at http://127.0.0.1:4173
```

Build an AppImage locally:

```bash
./thirdflare-one build appimage   # → dist/packages/thirdflare-*-x86_64.AppImage
```

Full contributor guide: **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**

## Requirements

| Component | Notes |
|-----------|--------|
| Cloudflare WARP | `warp-cli` on `PATH` — [Linux](https://developers.cloudflare.com/warp-client/get-started/linux/) · [macOS](https://developers.cloudflare.com/warp-client/get-started/macos/) |
| Node.js 20+ | Host Node for deb/rpm; bundled in AppImage / Flatpak / Snap |
| Browser | For the Web UI when enabled |

## CLI reference

| Command | Description |
|---------|-------------|
| `thirdflare-one` | Start daemon and open Web UI |
| `thirdflare-one --no-open` | Start API-only daemon |
| `thirdflare-one --connect` | Connect WARP and open UI |
| `thirdflare-one --disconnect` | Disconnect WARP |
| `thirdflare-one --toggle` | Toggle WARP connection |
| `thirdflare-one --status` | Daemon health |
| `thirdflare-one --stop` | Stop managed daemon |
| `thirdflare-one --version` | Print version |
| `thirdflare-one --tray` | Optional tray menu (requires `yad`) |

`thirdflare` and `thirdflare-one-gui` are equivalent aliases.

### Operator entrypoint (from a checkout)

```bash
./thirdflare-one install [options]   # idempotent user install
./thirdflare-one build appimage      # build packages
./thirdflare-one run [args]          # same as bin/thirdflare
./thirdflare-one test all            # run test suites
./thirdflare-one help
```

## Features

- Connect/disconnect, modes, Gateway DNS, split tunnel, trusted networks, registration, diagnostics via guarded `warp-cli`
- Optional Web UI (off by default for systemd)
- Layered configuration — `/etc/thirdflare`, user config, env vars, session overrides ([docs/CONFIGURATION.md](docs/CONFIGURATION.md))
- Linux nftables kill-switch ([docs/CONFIGURATION.md](docs/CONFIGURATION.md))
- Release updates with AppImage auto-apply ([docs/UPDATES.md](docs/UPDATES.md))
- Desktop notifications on WARP status changes

## Documentation

| Guide | Description |
|-------|-------------|
| [docs/README.md](docs/README.md) | Documentation index |
| [Getting started](docs/GETTING_STARTED.md) | Install paths, daily use, troubleshooting |
| [Contributing](docs/CONTRIBUTING.md) | Dev setup, tests, pull requests |
| [Configuration](docs/CONFIGURATION.md) | Config keys and environment variables |
| [Architecture](docs/ARCHITECTURE.md) | HTTP API and codebase overview |
| [Packaging](docs/PACKAGING.md) | Release artifacts and CI |
| [Updates](docs/UPDATES.md) | Update channels and manifest |
| [CI](docs/CI.md) | Test confidence levels |

## Distribution

Prebuilt packages: **[GitHub Releases](https://github.com/oldrepublicwizard/thirdflare-one/releases)**

```bash
# Container (API server — mount host warp-cli at runtime)
docker pull ghcr.io/oldrepublicwizard/thirdflare-one:latest

# macOS Homebrew
brew tap oldrepublicwizard/thirdflare-one homebrew-tap
brew install thirdflare-one
```

See **[docs/PACKAGING.md](docs/PACKAGING.md)** for deb/rpm/Flatpak/Snap details and maintainer workflows.

## Contributing

Contributions are welcome. Please read **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** before opening a pull request.

```bash
export WARP_CLI="$PWD/scripts/mock-warp-cli.mjs"
npm run check && npm run test:all
```

## License

[MIT](LICENSE)
