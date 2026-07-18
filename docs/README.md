# ThirdFlare One documentation

## Quick links

| I want to… | Read |
|------------|------|
| Install and run ThirdFlare One | [GETTING_STARTED.md](GETTING_STARTED.md) |
| Configure settings | [CONFIGURATION.md](CONFIGURATION.md) |
| Contribute or run tests | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Understand the architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Build packages | [PACKAGING.md](PACKAGING.md) |
| Understand updates | [UPDATES.md](UPDATES.md) |
| Understand CI | [CI.md](CI.md) |

## Common commands

```bash
# End user — from a clone
./thirdflare-one install
thirdflare-one

# Developer
export WARP_CLI="$PWD/scripts/mock-warp-cli.mjs"
npm run check && npm run test:all
npm run dev

# Maintainer
./thirdflare-one build appimage
./thirdflare-one build all
```

Project overview: [README.md](../README.md)
