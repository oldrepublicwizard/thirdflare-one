# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/compare/v0.1.0...v0.1.1) (2026-07-17)


### Features

* add CI/CD, WARP tests, packaging, GHCR, and Homebrew tap ([ba07197](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/ba071971c68c1f1ac44b446bb2111f7de481d2b4))


### Bug Fixes

* **ci:** skip Flatpak appstream compose and fix arch verify pipe ([081fee8](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/081fee871f4d0344943824b817ede629f5507e83))
* **ci:** stabilize package verification and flatpak build ([5299b35](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/5299b35ba810cb5d245606e9fd2356b7b6ee2c39))
* **flatpak:** drop unsupported build-export flag on CI ([dd2865a](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/dd2865a44fe651c69d40955f93da6db3e3a16005))
* **flatpak:** finish build dir and skip appstream branch update ([9731bac](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/9731bacdd8b75e2949eab0922a73f3caf8411412))
* **flatpak:** normalize xdg filesystem finish-args ([068e6fe](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/068e6fe8e298652152d0f0d45a6e67723ab4638d))
* **flatpak:** restore flatpak-builder repo export after metainfo fix ([07ba7cc](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/07ba7cc2f028725e936f645916167760ed8a01de))
* **flatpak:** use valid xdg filesystem paths in build-finish ([2c87c21](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/2c87c21a44084cd492e544ca5392cbc8b1a3cb0f))
* **flatpak:** validate AppStream metadata and export build dir ([69e7db8](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/69e7db86c455b71f903ef595bd96b9dbf89062fb))
* **packaging:** correct deb Depends syntax and Flatpak metainfo ([5e9a30c](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/5e9a30c6b38a841840edc9f94d231594e1408856))

## [0.1.0] - 2026-07-17

### Added

- Initial local Cloudflare One / WARP GUI for Linux (`server.js` + browser UI).
- Desktop launcher, optional yad tray, and user systemd helpers.
