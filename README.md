# Cloudflare One GUI for Linux

A local Windows-style Cloudflare One / WARP manager for Linux. The app wraps the installed `warp-cli` binary, shows current daemon state, and exposes WARP, Gateway DNS, tunnel, split tunnel, trusted network, registration, override, environment, and diagnostics workflows through a desktop-like GUI.

The home view uses `warp-cli --listen status` for live connection updates and periodically refreshes the full snapshot for tunnel, DNS, account, and policy details.

The browser shell includes installable app metadata, an app icon, and a service worker for the static UI shell. Live WARP state and actions still require the local Node server because they call the real `warp-cli`.

## Requirements

- Linux with Cloudflare WARP installed.
- `warp-cli` available on `PATH`.
- Node.js 20 or newer.
- A desktop browser for the current launcher path. Firefox is preferred when available; otherwise `xdg-open` is used.

## Run Locally

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

For a desktop-style launch:

```bash
./bin/cloudflare-one-gui
```

The launcher starts or reuses the local server, writes runtime state under `XDG_RUNTIME_DIR`, writes logs under `~/.cache/cloudflare-one-gui/`, and opens the GUI. It defaults to port `4173`; if that port is occupied by something else, it scans upward for a free local port.

The launcher also supports quick actions:

```bash
./bin/cloudflare-one-gui --connect
./bin/cloudflare-one-gui --disconnect
./bin/cloudflare-one-gui --toggle
./bin/cloudflare-one-gui --warp-status
./bin/cloudflare-one-gui --tray
```

`--tray` starts an optional `yad` notification-area menu when `yad` and a desktop display are available.

## Desktop Menu Integration

```bash
npm run install:desktop
```

This installs `~/.local/share/applications/cloudflare-one-gui.desktop`.
The desktop entry includes quick actions for Connect, Disconnect, Toggle, Status, and Tray.

Remove it with:

```bash
npm run uninstall:desktop
```

## Optional User Service

Install a user systemd service file:

```bash
npm run install:user-service
```

When your user systemd manager is available, enable it with:

```bash
systemctl --user enable --now cloudflare-one-gui.service
```

Remove the service file with:

```bash
npm run uninstall:user-service
```

## Safety Notes

The backend runs `warp-cli` directly with `spawn` (or `flatpak-spawn --host warp-cli` inside Flatpak); it does not invoke a shell. Registration IDs, device IDs, account IDs, public keys, and license values are redacted from API/UI output. Destructive actions such as deleting registration, resetting settings, or rotating keys require confirmation in the GUI.

## Packages and CI/CD

Prebuilt packages (`.deb`, `.rpm`, AppImage, Flatpak, Snap, source tarball) are published on [GitHub Releases](../../releases). See [docs/PACKAGING.md](docs/PACKAGING.md) for formats, install layout, and local `npm run package:*` commands.

Releases are driven by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) on `main` (`feat:`, `fix:`, `feat!:` / `BREAKING CHANGE:`). Merging the Release PR tags the version and triggers the packaging workflow.

### CI testing (WARP connectivity)

Every PR runs mock `warp-cli` integration tests (`npm run test:integration`) that exercise DNS resolution, `/api/health`, `/api/snapshot` (network/DNS debug), and guarded `/api/action` calls. Optionally trigger real WARP smoke on Ubuntu:

```bash
gh workflow run ci.yml -f real_warp=true
```

### Manual packaging run

Build all formats, push GHCR images, and upload workflow artifacts:

```bash
gh workflow run package.yml --ref main
gh workflow run package.yml --ref main -f publish_ghcr=true
```

### Container images (GHCR)

```bash
docker pull ghcr.io/oldrepublicwizard/cloudflare-one-gui-linux:latest
docker run --rm -p 4173:4173 ghcr.io/oldrepublicwizard/cloudflare-one-gui-linux:latest
```

Mount or install host `warp-cli` when running the container — the image ships the API server only.

### Homebrew (macOS)

After a release with the Homebrew tap updated:

```bash
brew tap oldrepublicwizard/cloudflare-one-gui-linux https://github.com/oldrepublicwizard/cloudflare-one-gui-linux.git homebrew-tap
brew install cloudflare-one-gui
```

Requires [Cloudflare WARP for macOS](https://developers.cloudflare.com/warp-client/get-started/macos/) so `warp-cli` is available.

## Current Scope

This is a functional local GUI layer, not a packaged native Electron/Tauri/WebKit application yet. Distro packages ship the Node server plus browser launcher. The Parity page tracks implemented Windows-like surfaces and remaining native gaps; the desktop entry provides quick actions and an optional `yad` tray while bundled AppIndicator/Electron/Tauri packaging remains future native work.

## License

MIT — see [LICENSE](LICENSE).
