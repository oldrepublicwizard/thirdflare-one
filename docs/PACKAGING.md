# Packaging

ThirdFlare ships as `thirdflare` packages (legacy `cloudflare-one-gui` wrapper included). Artifacts do **not** bundle Cloudflare WARP — install the official client first.
https://developers.cloudflare.com/warp-client/get-started/linux/

## Formats

| Artifact | Depends on | Notes |
|----------|------------|-------|
| `.deb` / `.rpm` / Arch `.pkg.tar.zst` | System `nodejs >= 20` | Built with [nfpm](https://nfpm.goreleaser.com/) |
| `.AppImage` | Host `warp-cli` | Bundles Node 20; x86_64 |
| `.flatpak` | Host `warp-cli` | Calls `flatpak-spawn --host warp-cli` (sandbox escape by design) |
| `.snap` (classic) | Host `warp-cli` | Classic confinement required |
| `*-src.tar.gz` + `PKGBUILD` | — | For AUR / manual builds |
| `SHA256SUMS` | — | Always published with releases |
| **Docker (ghcr.io)** | Host `warp-cli` when running container | API server image + CI builder image |
| **Homebrew (macOS)** | `node@20`, host `warp-cli` | Tap branch `homebrew-tap` |

## CI / manual runs

```bash
# PR CI: syntax, mock warp-cli integration, update tests, deb/rpm smoke
gh workflow run ci.yml --ref main

# Optional real WARP attempt on Ubuntu runner (soft-fail if daemon unavailable)
gh workflow run ci.yml --ref main -f real_warp=true

# Full packaging matrix + ghcr.io images + workflow artifacts
gh workflow run package.yml --ref main

# Publish to an existing GitHub Release tag (+ sync update-manifest)
gh workflow run package.yml --ref main -f tag=v0.1.0 -f publish_release=true -f update_homebrew_tap=true
```

### Release Please

Release Please bumps versions from Conventional Commits. Enable **Allow GitHub Actions to create and approve pull requests** under repo Settings → Actions → General, or the workflow fails. Published releases trigger `package.yml`, which uploads artifacts and updates `config/update-manifest.json` (see [UPDATES.md](UPDATES.md)).

### WARP testing in CI

- **Default:** `scripts/mock-warp-cli.sh` via `WARP_CLI` exercises `/api/health`, `/api/snapshot` (network/DNS debug), and `/api/action`.
- **Updates:** `npm run test:update` covers semver, manifest, and AppImage apply with mocked GitHub.
- **Optional:** `scripts/ci-real-warp-smoke.sh` installs Cloudflare's `cloudflare-warp` package and re-runs integration tests against real `warp-cli` when the daemon responds.

## Container images (GHCR)

After `package.yml` runs with `publish_ghcr` enabled:

```bash
docker pull ghcr.io/oldrepublicwizard/cloudflare-one-gui-linux:latest
docker run --rm -p 4173:4173 -e WARP_CLI=/path/to/warp-cli ghcr.io/oldrepublicwizard/cloudflare-one-gui-linux:latest
```

CI builder image:

```bash
docker pull ghcr.io/oldrepublicwizard/cloudflare-one-gui-linux-ci:latest
```

## Homebrew (macOS)

After a release with `update_homebrew_tap=true`:

```bash
brew tap oldrepublicwizard/cloudflare-one-gui-linux homebrew-tap
brew install cloudflare-one-gui
cloudflare-one-gui --no-open
```

Requires [Cloudflare WARP for macOS](https://developers.cloudflare.com/warp-client/get-started/macos/) so `warp-cli` is available.

## Local commands

```bash
npm run check
npm run test:integration          # mock warp-cli HTTP integration
npm run test:update               # update engine unit tests
npm run test:warp:real            # optional real warp-cli smoke (Linux)
npm run package:stage
npm run package:deb
npm run package:rpm
npm run package:arch
npm run package:appimage
npm run package:flatpak
npm run package:snap
npm run package:source
npm run package:verify            # verify all built artifacts
npm run package:homebrew
npm run package:checksums
```

## Install layout (deb/rpm/arch)

```
/usr/bin/thirdflare
/usr/bin/cloudflare-one-gui   # legacy wrapper
/usr/lib/thirdflare/          # server.js, public/, bin/, scripts/, assets/, lib/
/usr/share/applications/thirdflare.desktop
/usr/share/icons/hicolor/scalable/apps/thirdflare.svg
/usr/lib/systemd/user/thirdflare.service
```

Enable the optional user service after install:

```bash
systemctl --user enable --now thirdflare.service
```

## Signing

CI publishes `SHA256SUMS` for every release. Optional GPG signing of `.deb`/`.rpm` can be
enabled later by setting repository secrets `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE` and
extending [`packaging/scripts/checksums.sh`](../packaging/scripts/checksums.sh).

## Architecture

v1 packages target **x86_64** (AppImage / Flatpak / Snap). Deb/rpm/arch use `all`/`any`
because the payload is architecture-independent JavaScript (system Node provides the arch).
