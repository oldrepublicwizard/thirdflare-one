# Packaging

ThirdFlare One ships as `thirdflare` / `thirdflare-one` packages. Artifacts do **not** bundle Cloudflare WARP — install the official client first.

https://developers.cloudflare.com/warp-client/get-started/linux/

## Formats

| Artifact | Depends on | Notes |
|----------|------------|-------|
| `.deb` / `.rpm` / Arch `.pkg.tar.zst` | System `nodejs >= 20` | Built with [nfpm](https://nfpm.goreleaser.com/) |
| `.AppImage` | Host `warp-cli` | Bundles Node 20; x86_64 |
| `.flatpak` | Host `warp-cli` | Calls `flatpak-spawn --host warp-cli` |
| `.snap` (classic) | Host `warp-cli` | Classic confinement required |
| `thirdflare-one-*-src.tar.gz` + `PKGBUILD` | — | For AUR / manual builds |
| `SHA256SUMS` | — | Published with releases |
| **Docker (ghcr.io)** | Host `warp-cli` when running container | API server + CI builder images |
| **Homebrew (macOS)** | `node@20`, host `warp-cli` | Tap branch `homebrew-tap` |

## CI / manual runs

```bash
# PR CI: syntax, mock warp-cli integration, update tests, deb/rpm smoke
gh workflow run ci.yml --ref main

# Optional real WARP attempt on Ubuntu runner
gh workflow run ci.yml --ref main -f real_warp=true

# Full packaging matrix + ghcr.io images
gh workflow run package.yml --ref main

# Publish to an existing GitHub Release tag
gh workflow run package.yml --ref main -f tag=v0.1.0 -f publish_release=true -f update_homebrew_tap=true
```

See [UPDATES.md](UPDATES.md) for Release Please and manifest sync.

## Container images (GHCR)

```bash
docker pull ghcr.io/oldrepublicwizard/thirdflare-one:latest
docker run --rm -p 4173:4173 -e WARP_CLI=/path/to/warp-cli ghcr.io/oldrepublicwizard/thirdflare-one:latest

docker pull ghcr.io/oldrepublicwizard/thirdflare-one-ci:latest
```

## Homebrew (macOS)

```bash
brew tap oldrepublicwizard/thirdflare-one homebrew-tap
brew install thirdflare-one
thirdflare-one --no-open
```

Requires [Cloudflare WARP for macOS](https://developers.cloudflare.com/warp-client/get-started/macos/).

## Local commands

See **[GETTING_STARTED.md](../GETTING_STARTED.md)** (usage) and **[CONTRIBUTING.md](../CONTRIBUTING.md)** (build from source).

```bash
./thirdflare-one install
./thirdflare-one build appimage
./thirdflare-one build all
npm run package:stage
npm run package:deb
npm run package:verify
```

## Install layout (deb/rpm/arch)

```
/usr/bin/thirdflare
/usr/bin/thirdflare-one
/usr/bin/thirdflare-one-gui
/usr/lib/thirdflare/
/usr/share/applications/thirdflare-one.desktop
/usr/share/icons/hicolor/scalable/apps/thirdflare.svg
/usr/lib/systemd/user/thirdflare-one.service
```

Enable the user service after install:

```bash
systemctl --user enable --now thirdflare-one.service
```

## Signing

CI publishes `SHA256SUMS` for every release. Optional GPG signing of `.deb`/`.rpm` can be enabled later via repository secrets and [`packaging/scripts/checksums.sh`](../packaging/scripts/checksums.sh).
