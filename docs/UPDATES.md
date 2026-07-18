# Updates

ThirdFlare One checks GitHub Releases for newer versions, with optional AppImage auto-apply and fork/release selection (PyKotor-inspired, streamlined).

## Pipeline

```text
Conventional Commits on main
        │
        ▼
release-please.yml  →  Release PR  →  GitHub Release (tag vX.Y.Z)
        │
        ├─ (same push run) package.yml via workflow_call
        │     — required because GITHUB_TOKEN-created releases do not
        │       fire other workflows' `on: release` triggers
        │
        └─ package.yml also still listens for `release: published`
              (manual / non-Actions releases)

package.yml
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

### Why Package is called from Release Please

GitHub does not start new workflow runs for `release` (or other) events that were produced using the default `GITHUB_TOKEN`. Release Please publishes with that token, so `package.yml`'s `on: release` alone never runs after an automated release. The `workflow_call` job in `release-please.yml` runs Package in the same workflow graph when `release_created` is true.

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
- `updates.source` — `{ owner, repo }` (default upstream; change via config file/env to use a fork — **not** session-overridable)
- `updates.checkOnStartup` — non-blocking toast when Web UI is open

APIs:

- `GET /api/version`
- `GET /api/update/check` — includes one-time `applyConfirmToken` for AppImage applies
- `GET /api/update/releases?owner=&repo=`
- `GET /api/update/forks`
- `POST /api/update/prepare` — resolve tag + issue apply token
- `POST /api/update/apply` — AppImage only; requires `confirmToken`; refused when bind is non-loopback unless `THIRDFLARE_ALLOW_REMOTE_APPLY=1`

Optional auth for higher GitHub rate limits: `THIRDFLARE_GITHUB_TOKEN` or `GITHUB_TOKEN`.

Override install detection: `THIRDFLARE_INSTALL_FORMAT=appimage|deb|rpm|…`  
AppImage path override: `THIRDFLARE_APPIMAGE_PATH=/path/to/ThirdFlare-One.AppImage`

AppImage downloads re-validate redirect hosts and verify against release `SHA256SUMS` when that asset is published.

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
