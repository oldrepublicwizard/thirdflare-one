# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3](https://github.com/oldrepublicwizard/thirdflare-one/compare/v0.2.2...v0.2.3) (2026-07-18)


### Features

* **ci:** Cross-OS CI confidence + basic Account ([#12](https://github.com/oldrepublicwizard/thirdflare-one/issues/12)) ([352a4dc](https://github.com/oldrepublicwizard/thirdflare-one/commit/352a4dcf9e2c518a9708ec299e202deb4547add3))
* **config:** persist kill switch desired state to user config ([#10](https://github.com/oldrepublicwizard/thirdflare-one/issues/10)) ([8b3a6c2](https://github.com/oldrepublicwizard/thirdflare-one/commit/8b3a6c2f6014cf7896f72df886a8a715336c2e82))
* **killswitch:** pause nft rules during Zero Trust enrollment ([#11](https://github.com/oldrepublicwizard/thirdflare-one/issues/11)) ([51096a7](https://github.com/oldrepublicwizard/thirdflare-one/commit/51096a7e9b11793729db42c8784751c6cb355132))


### Bug Fixes

* **ci:** chain Package from Release Please via workflow_call ([#8](https://github.com/oldrepublicwizard/thirdflare-one/issues/8)) ([20c7a8b](https://github.com/oldrepublicwizard/thirdflare-one/commit/20c7a8b95a876a3807cadd679bd00e88ca43fb34))

## [0.2.2](https://github.com/oldrepublicwizard/thirdflare-one/compare/v0.2.1...v0.2.2) (2026-07-18)


### Features

* Account enrollment, kill switch, tips, and update comboboxes ([#6](https://github.com/oldrepublicwizard/thirdflare-one/issues/6)) ([79f0886](https://github.com/oldrepublicwizard/thirdflare-one/commit/79f0886b0d8c9cafe30ae0985897f3dbf123d5d5))

## [0.2.1](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/compare/v0.2.0...v0.2.1) (2026-07-17)


### Features

* desktop notifications on WARP status transitions ([f357041](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/f357041e41fdfb7f8fda6b60000ba14d241e1e0f))
* emit desktop notifications on WARP status transitions ([e4bd3b1](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/e4bd3b1abf26c7fd68d8aa6c158620d95e1f8745))

## [0.2.0](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/compare/v0.1.0...v0.2.0) (2026-07-17)


### ⚠ BREAKING CHANGES

* rebrand project to ThirdFlare

### Features

* add CI/CD, WARP tests, packaging, GHCR, and Homebrew tap ([ba07197](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/ba071971c68c1f1ac44b446bb2111f7de481d2b4))
* add i18n, tooltips, and release-synced updates ([163ff94](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/163ff94e472733ac543a152533a0a7293026d5bc))
* rebrand project to ThirdFlare ([3ac222d](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/3ac222d2385c73478322ee1175a8336fa25ae362))
* ThirdFlare One rebrand, i18n, and release-synced updates ([54076a7](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/54076a79c34e861877a844cb59baea6b3e646585))


### Bug Fixes

* **ci:** skip Flatpak appstream compose and fix arch verify pipe ([081fee8](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/081fee871f4d0344943824b817ede629f5507e83))
* **ci:** stabilize package verification and flatpak build ([5299b35](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/5299b35ba810cb5d245606e9fd2356b7b6ee2c39))
* **flatpak:** drop unsupported build-export flag on CI ([dd2865a](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/dd2865a44fe651c69d40955f93da6db3e3a16005))
* **flatpak:** finish build dir and skip appstream branch update ([9731bac](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/9731bacdd8b75e2949eab0922a73f3caf8411412))
* **flatpak:** normalize xdg filesystem finish-args ([068e6fe](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/068e6fe8e298652152d0f0d45a6e67723ab4638d))
* **flatpak:** restore flatpak-builder repo export after metainfo fix ([07ba7cc](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/07ba7cc2f028725e936f645916167760ed8a01de))
* **flatpak:** use valid xdg filesystem paths in build-finish ([2c87c21](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/2c87c21a44084cd492e544ca5392cbc8b1a3cb0f))
* **flatpak:** validate AppStream metadata and export build dir ([69e7db8](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/69e7db86c455b71f903ef595bd96b9dbf89062fb))
* harden AppImage apply against remote session pivot ([1ba701f](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/1ba701f4b3190aa1fab05ecc54f40643db7be961))
* harden update apply and session config allowlist ([26f6e91](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/26f6e91ce263327a2589817ad4db305fb288731b))
* **packaging:** correct deb Depends syntax and Flatpak metainfo ([5e9a30c](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/5e9a30c6b38a841840edc9f94d231594e1408856))
* **packaging:** stage lib/update/confirm.mjs in package payload ([5584287](https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/commit/5584287ae60890771c96eae013531a5f05469b26))

## [0.1.0] - 2026-07-17

### Added

- Initial local Cloudflare One / WARP GUI for Linux (`server.js` + browser UI).
- Desktop launcher, optional yad tray, and user systemd helpers.
