# Updates

ThirdFlare checks GitHub Releases for newer versions, with optional AppImage auto-apply and fork/release selection (PyKotor-inspired, streamlined).

## Pipeline

```text
Conventional Commits on main
        │
        ▼
release-please.yml  →  Release PR  →  GitHub Release (tag vX.Y.Z)
        │
        ▼
package.yml (on release published)
        │
        ├─ deb / rpm / AppImage / Flatpak / Snap / Docker / Homebrew
        │
        └─ sync-manifest job
              updates config/update-manifest.json on main [skip ci]
```

### Release Please permissions

If Release Please fails with *GitHub Actions is not permitted to create or approve pull requests*:

1. Open the repo **Settings → Actions → General**
2. Under **Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**
3. Re-run the Release Please workflow

## Update manifest

[`config/update-manifest.json`](../config/update-manifest.json) is the stable URL clients fetch:

```text
https://raw.githubusercontent.com/<owner>/<repo>/main/config/update-manifest.json
```

Schema:

```json
{
  "schema": 1,
  "stable": { "version": "0.1.0", "tag": "v0.1.0" },
  "beta": null
}
```

- **stable** — latest non-prerelease
- **beta** — latest prerelease pointer (optional)

Regenerate locally:

```bash
node scripts/generate-update-manifest.mjs --version 1.2.0
node scripts/generate-update-manifest.mjs --version 1.3.0-beta.1 --prerelease --dry-run
```

## Client behavior

| Install format | In-app apply |
|----------------|--------------|
| AppImage | Download matching `thirdflare-*-x86_64.AppImage`, replace binary, prompt restart |
| deb / rpm / Homebrew / Flatpak / Snap | Show copy-paste upgrade commands |

Config keys (see [CONFIGURATION.md](CONFIGURATION.md)):

- `updates.channel` — `stable` | `beta`
- `updates.source` — `{ owner, repo }` (default upstream; change to use a fork)
- `updates.checkOnStartup` — non-blocking toast when Web UI is open

APIs:

- `GET /api/version`
- `GET /api/update/check`
- `GET /api/update/releases?owner=&repo=`
- `GET /api/update/forks`
- `POST /api/update/apply` — AppImage only

Optional auth for higher GitHub rate limits: `THIRDFLARE_GITHUB_TOKEN` or `GITHUB_TOKEN`.

Override install detection: `THIRDFLARE_INSTALL_FORMAT=appimage|deb|rpm|…`  
AppImage path override: `THIRDFLARE_APPIMAGE_PATH=/path/to/ThirdFlare.AppImage`

## Asset naming contract

Forks that want to be selectable must publish assets matching:

| Format | Pattern |
|--------|---------|
| AppImage | `thirdflare-<version>-x86_64.AppImage` |
| deb | `thirdflare_<version>_all.deb` |
| rpm | `thirdflare-<version>-1.noarch.rpm` (or similar `*.rpm`) |
| snap | `thirdflare_<version>_amd64.snap` |

## Tests

```bash
npm run test:update
npm run test:all
```
