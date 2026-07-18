# Getting started with ThirdFlare One

ThirdFlare One is an unofficial desktop client for [Cloudflare One / WARP](https://developers.cloudflare.com/cloudflare-one/). It wraps your existing **`warp-cli`** install with a local HTTP API and an optional browser UI — the experience Windows users get from the official app, on Linux, macOS, and headless setups.

> **Not affiliated with Cloudflare.** You must install Cloudflare’s WARP client separately. ThirdFlare One does not replace the WARP daemon.

## What you need

| Requirement | Why |
|-------------|-----|
| [Cloudflare WARP](https://developers.cloudflare.com/warp-client/get-started/linux/) with `warp-cli` on `PATH` | ThirdFlare One controls WARP; it does not bundle it |
| **Node.js 20+** (host or bundled) | Runs the HTTP daemon. AppImage bundles Node; deb/rpm use system Node |
| A browser (optional) | For the Web UI when enabled. Firefox is preferred on Linux |

Check WARP:

```bash
warp-cli --version
warp-cli status
```

---

## Choose how to install

There are three common paths. Pick one.

### 1. Prebuilt release (recommended for most users)

Download an artifact from [GitHub Releases](https://github.com/oldrepublicwizard/thirdflare-one/releases):

| Format | Best for |
|--------|----------|
| **AppImage** | Portable Linux x86_64 — no system Node required |
| **.deb / .rpm / Arch** | System package managers — uses host `nodejs >= 20` |
| **Flatpak / Snap** | Sandboxed Linux installs (classic Snap; Flatpak calls host `warp-cli`) |
| **Homebrew** (macOS) | `brew tap` + `brew install` — see [PACKAGING.md](PACKAGING.md) |

After installing a package, launch from your app menu or run:

```bash
thirdflare-one          # open Web UI
thirdflare-one --no-open   # API-only daemon
```

AppImage example:

```bash
chmod +x thirdflare-*-x86_64.AppImage
./thirdflare-*-x86_64.AppImage
```

### 2. Local user install from a git checkout

Use this when you clone the repo and want a **stable install path** that does not break when you move the checkout.

From the repository root:

```bash
./thirdflare-one install
```

This is **idempotent** — safe to run again after `git pull`.

**What it installs:**

| Path | Purpose |
|------|---------|
| `~/.local/share/thirdflare-one/` | Application tree (synced from your checkout) |
| `~/.local/bin/thirdflare`, `thirdflare-one`, `thirdflare-one-tray` | CLI commands on your `PATH` |
| `~/.local/share/applications/thirdflare-one.desktop` | Application menu entry |

Optional systemd user daemon:

```bash
./thirdflare-one install --service
systemctl --user enable --now thirdflare-one.service
```

Override install location:

```bash
THIRDFLARE_ONE_HOME=$HOME/apps/thirdflare-one ./thirdflare-one install
```

Uninstall desktop links and CLI symlinks (keep the tree):

```bash
./thirdflare-one uninstall
```

Remove everything including the install tree:

```bash
./thirdflare-one uninstall --purge
```

> **Tip:** Re-run `./thirdflare-one install` after moving or deleting a git checkout to refresh desktop entries and CLI links.

### 3. Run directly from a checkout (development)

No install step — good for hacking on the code:

```bash
git clone https://github.com/oldrepublicwizard/thirdflare-one.git
cd thirdflare-one
npm install          # devDependencies only (Playwright for UI tests)

npm run dev          # server + Web UI at http://127.0.0.1:4173
# or
./bin/thirdflare     # launcher: starts daemon, opens browser
```

Do **not** use `npm run install` from a moving checkout for menu entries — `./thirdflare-one install` copies to a stable path under `~/.local/share/thirdflare-one`.

---

## Daily usage

### Operator entrypoint: `thirdflare-one`

The repo ships `./thirdflare-one` as the single entrypoint for install, build, run, and test:

```bash
./thirdflare-one help
./thirdflare-one install
./thirdflare-one run
./thirdflare-one build appimage
./thirdflare-one test all
```

After a user install, `thirdflare-one` is also on your `PATH` via `~/.local/bin`.

### Launcher CLI: `thirdflare` / `thirdflare-one`

Both names run the same launcher (`bin/thirdflare`):

```bash
thirdflare-one                 # start daemon + open Web UI
thirdflare-one --no-open       # start daemon, print URL (Web UI off by default)
thirdflare-one --connect       # warp-cli connect + open UI
thirdflare-one --disconnect
thirdflare-one --toggle
thirdflare-one --warp-status
thirdflare-one --tray          # optional yad system tray (requires yad)
thirdflare-one --status        # is the daemon healthy?
thirdflare-one --stop
thirdflare-one --version
```

Default URL when the daemon is running: **http://127.0.0.1:4173**

### Web UI

The Web UI is a static app served by the Node daemon when enabled.

| How | Web UI |
|-----|--------|
| `thirdflare-one` (no flags) | **On** — launcher sets `THIRDFLARE_WEBUI=1` |
| `thirdflare-one --no-open` | **Off** by default |
| systemd user service | **Off** by default (API-only daemon) |
| `webui.enabled: true` in config | **On** persistently — see [CONFIGURATION.md](CONFIGURATION.md) |

Open **http://127.0.0.1:4173** when the UI is enabled.

### systemd background daemon

For an always-on API server without opening a browser:

```bash
./thirdflare-one install --service
systemctl --user enable --now thirdflare-one.service
systemctl --user status thirdflare-one.service
```

Packaged `.deb`/`.rpm` installs also ship `/usr/lib/systemd/user/thirdflare-one.service`.

To enable the Web UI on the service, edit config or use a drop-in — see [CONFIGURATION.md](CONFIGURATION.md).

### Optional tray menu

Requires **yad** and a graphical session:

```bash
thirdflare-one --tray
# or
thirdflare-one-tray
```

---

## Configuration (overview)

Settings merge from several layers (lowest → highest priority):

1. Built-in defaults  
2. `/etc/thirdflare/config.json`  
3. `/etc/default/thirdflare` (systemd environment file)  
4. `~/.config/thirdflare/config.json`  
5. Environment variables (`THIRDFLARE_*`)  
6. In-app session overrides (until daemon restart)

Common environment variables:

| Variable | Purpose |
|----------|---------|
| `THIRDFLARE_WEBUI=1` | Enable Web UI for this process |
| `THIRDFLARE_PORT=4173` | HTTP port |
| `WARP_CLI=/path/to/warp-cli` | Override warp-cli binary |
| `THIRDFLARE_WARP_CLI` | Same as `WARP_CLI` (preferred) |

Full key reference: **[CONFIGURATION.md](CONFIGURATION.md)**

Example user config:

```bash
mkdir -p ~/.config/thirdflare
cp config/config.example.json ~/.config/thirdflare/config.json
# edit webui.enabled, ui.notifications, killswitch, updates.channel, etc.
```

---

## Building packages locally

From a checkout, use the operator entrypoint or npm scripts:

```bash
./thirdflare-one build appimage    # → dist/packages/thirdflare-VERSION-x86_64.AppImage
./thirdflare-one build deb
./thirdflare-one build rpm
./thirdflare-one build all         # stage + deb + rpm + appimage + source + checksums
```

Equivalent npm commands: `npm run package:appimage`, `npm run package:deb`, etc.

Details, CI release flow, Docker, and Homebrew: **[PACKAGING.md](PACKAGING.md)**

---

## Updates

In-app **Settings → Updates** checks GitHub Releases (stable/beta channels, optional forks). **AppImage** installs can auto-apply updates after confirmation. Other formats show guided install commands.

Release pipeline and manifest: **[UPDATES.md](UPDATES.md)**

---

## Troubleshooting

### Desktop entry does nothing / wrong path

Re-run the idempotent installer from any checkout:

```bash
./thirdflare-one install
```

Verify the desktop file points at `~/.local/share/thirdflare-one`, not an old checkout path:

```bash
grep ^Exec= ~/.local/share/applications/thirdflare-one.desktop
```

### Daemon does not start

```bash
thirdflare-one --status
cat ~/.cache/thirdflare/server.log
```

Ensure Node 20+ is available (`node --version`) unless you use AppImage.

### `warp-cli` not found

Install [Cloudflare WARP for Linux](https://developers.cloudflare.com/warp-client/get-started/linux/) or set:

```bash
export WARP_CLI=/full/path/to/warp-cli
```

### Web UI blank or 404

Confirm Web UI is enabled (`THIRDFLARE_WEBUI=1` or `webui.enabled: true`) and open **http://127.0.0.1:4173** (not https).

### Kill switch / nftables

The kill switch installs nftables rules and requires privilege (`nft` or `pkexec`). It is Linux-only. See [CONFIGURATION.md](CONFIGURATION.md) and the in-app Kill Switch page.

---

## Next steps

| Topic | Document |
|-------|----------|
| Every config key and systemd drop-in | [CONFIGURATION.md](CONFIGURATION.md) |
| API routes, security model, codebase map | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Package formats and release CI | [PACKAGING.md](PACKAGING.md) |
| Update channels and AppImage apply | [UPDATES.md](UPDATES.md) |
| Contributing code and tests | [CONTRIBUTING.md](CONTRIBUTING.md) |
