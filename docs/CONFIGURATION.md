# Configuration

ThirdFlare One uses layered configuration so operators can manage the daemon idiomatically on each platform while still allowing provisional overrides from the app.

## Precedence (low → high)

| Layer | Location | Typical use |
|-------|----------|-------------|
| 1. Defaults | in `lib/config.mjs` | Safe localhost-only baseline |
| 2. System JSON | `/etc/thirdflare/config.json` | Fleet / machine policy |
| 3. Environment file | `/etc/default/thirdflare` | Debian/RHEL-style `KEY=value` for systemd |
| 4. User JSON | `~/.config/thirdflare/config.json` | Per-user preferences |
| 5. Prior install path | `~/.config/cloudflare-one-gui/config.json` | Migrated automatically if present |
| 6. Environment | `THIRDFLARE_*`, `WARP_CLI`, `PORT` | Containers, CI, drop-ins |
| 7. Session | `POST /api/config/session` | In-app toggles until restart |

Higher layers win on conflicting keys.

## Config file schema

Copy the example:

```bash
sudo install -d /etc/thirdflare
sudo cp config/config.example.json /etc/thirdflare/config.json
sudo cp packaging/thirdflare.default /etc/default/thirdflare
```

### `server`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | number | `4173` | HTTP listen port |
| `bind` | string | `127.0.0.1` | Bind address when remote Web UI is off |

### `webui`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `false` | Serve static Web UI and PWA assets |
| `allowRemote` | boolean | `false` | When enabled, bind `0.0.0.0` for LAN access |

**Defaults:** systemd daemon runs with Web UI **off** (`THIRDFLARE_WEBUI=0`). Running `thirdflare` (no flags) exports `THIRDFLARE_WEBUI=1` for that process tree so the browser shell works locally.

### `warp`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cli` | string | `warp-cli` | Path or name of the WARP CLI binary |
| `killSwitch` | boolean | `false` | Apply ThirdFlare nftables kill switch on startup / via API. **Persisted** to `~/.config/thirdflare/config.json` after a successful `POST /api/killswitch` |
| `killSwitchAllowLan` | boolean | `false` | When kill switch is on, also allow RFC1918 / ULA LAN destinations (persisted with `killSwitch`) |

Flatpak builds call `flatpak-spawn --host` automatically when `cli` is `warp-cli`.

**Kill switch:** Linux `warp-cli` has no public Always On toggle. ThirdFlare installs table `inet thirdflare_killswitch` (via `nft` or `pkexec nft`) so outbound traffic is dropped unless it uses `lo`, `CloudflareWARP`, or Cloudflare bootstrap/ingress IPs. Requires nftables and privilege to load rules. Successful toggles persist to the user config file.

Zero Trust browser/IdP enrollment cannot reach `*.cloudflareaccess.com` / corporate IdPs while the filter is active. ThirdFlare **pauses** the kill switch (removes rules, does not clear persisted desired) when you open the Access portal, run `registerOrganization`, or submit a `registrationToken`. Completing a registration token restores the kill switch; otherwise it auto-resumes after 30 minutes. `POST /api/killswitch/enrollment-pause` with `{ "mode": "begin" | "end" }` controls this explicitly.

### `ui`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `openBrowser` | boolean | `true` | Launcher opens a browser when starting GUI |
| `theme` | string | `system` | Reserved for future theme sync |
| `locale` | string | `en` | UI locale (`public/locales/<locale>.json`) |
| `notifications` | boolean | `true` | Desktop notifications on WARP connect/disconnect (requires `notify-send`) |

### `updates`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `channel` | string | `stable` | `stable` or `beta` (prereleases) |
| `source.owner` / `source.repo` | string | upstream GitHub repo | Release/fork source for updates |
| `checkOnStartup` | boolean | `true` | Non-blocking update toast when Web UI is open |

See [UPDATES.md](UPDATES.md) for the release → client pipeline.

## Environment variables

| Variable | Maps to | Example |
|----------|---------|---------|
| `THIRDFLARE_PORT` | `server.port` | `4173` |
| `THIRDFLARE_BIND` | `server.bind` | `127.0.0.1` |
| `THIRDFLARE_WEBUI` | `webui.enabled` | `1` / `0` |
| `THIRDFLARE_WEBUI_ALLOW_REMOTE` | `webui.allowRemote` | `1` / `0` |
| `THIRDFLARE_WARP_CLI` | `warp.cli` | `/usr/bin/warp-cli` |
| `WARP_CLI` | `warp.cli` | CI mock scripts |
| `THIRDFLARE_LOCALE` | `ui.locale` | `en` |
| `THIRDFLARE_NOTIFICATIONS` | `ui.notifications` | `1` / `0` |
| `THIRDFLARE_DISABLE_NOTIFICATIONS` | (runtime) | `1` skips notify-send even if enabled |
| `THIRDFLARE_UPDATE_CHANNEL` | `updates.channel` | `stable` / `beta` |
| `THIRDFLARE_UPDATE_SOURCE` | `updates.source` | `owner/repo` |
| `THIRDFLARE_UPDATE_CHECK` | `updates.checkOnStartup` | `0` to disable |
| `THIRDFLARE_INSTALL_FORMAT` | install detection | `appimage` / `deb` / … |
| `THIRDFLARE_APPIMAGE_PATH` | AppImage replace target | `/path/to/app.AppImage` |
| `THIRDFLARE_GITHUB_TOKEN` | GitHub API auth | PAT for higher rate limits |

Legacy `CLOUDFLARE_ONE_GUI_PORT` and `CLOUDFLARE_ONE_GUI_NODE` remain supported for migration.

## systemd

### User service (recommended for desktops)

```bash
npm run install:service
systemctl --user enable --now thirdflare-one.service
systemctl --user status thirdflare
```

Packaged path: `/usr/lib/systemd/user/thirdflare-one.service`

The unit loads:

```ini
EnvironmentFile=-/etc/default/thirdflare
Environment=THIRDFLARE_WEBUI=0
```

### Drop-in override (idiomatic)

```bash
systemctl --user edit thirdflare
```

Example drop-in:

```ini
[Service]
Environment=THIRDFLARE_PORT=5000
Environment=THIRDFLARE_WEBUI=1
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user restart thirdflare
```

### System-wide (optional)

For shared machines, install unit files under `/etc/systemd/system/` and point `WorkingDirectory=/usr/lib/thirdflare`. Prefer `/etc/thirdflare/config.json` for policy so unprivileged users cannot override fleet settings without sudo.

## In-app session overrides

Inspect effective config:

```bash
curl -s http://127.0.0.1:4173/api/config | jq
```

Apply provisional overrides (lost on daemon restart unless written to disk separately).

Session may set `ui.locale` / `ui.theme` / `ui.openBrowser` / `ui.notifications` and `updates.channel` / `updates.checkOnStartup` via `/api/config/session`.  
`updates.source` may only change through `POST /api/update/source`, which accepts the pinned upstream or one of its GitHub forks.  
`warp.killSwitch` / `warp.killSwitchAllowLan` are written to the **user** config file by `POST /api/killswitch` after nftables apply succeeds (not via `/api/config/session`). Failed applies do not change the file. Fleet policy in `/etc/thirdflare/config.json` still loads first, but a later user file value for the same keys wins under normal precedence — treat UI toggles as per-user.  
`warp.cli`, `server.*`, and `webui.*` are **not** session-overridable.

```bash
curl -s -X POST http://127.0.0.1:4173/api/config/session \
  -H 'content-type: application/json' \
  -d '{"config":{"updates":{"channel":"beta"}}}'
```

Clear session overrides:

```bash
curl -s -X POST http://127.0.0.1:4173/api/config/session \
  -H 'content-type: application/json' \
  -d '{"clear":true}'
```

**Restart required** after changing `server.port`, `server.bind`, or `webui.allowRemote`.

## Platform notes

| OS | Idiomatic config |
|----|------------------|
| Linux (deb/rpm) | `/etc/default/thirdflare` + `/etc/thirdflare/config.json` |
| Linux (user) | `~/.config/thirdflare/config.json` + user systemd |
| macOS (Homebrew) | `~/.config/thirdflare/config.json` + `launchctl`/`brew services` (future) |
| Container | `THIRDFLARE_*` env vars on `docker run` |

## WARP / Cloudflare One settings

ThirdFlare One does **not** replace Cloudflare account policy or MDM. Device modes, split tunnels, Gateway IDs, and registration are still applied through `warp-cli` exactly as on Windows — ThirdFlare One is a drop-in UI and automation layer, not a separate VPN implementation.
