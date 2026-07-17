#!/usr/bin/env node
/**
 * Generate or update config/update-manifest.json for a release.
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs --version 1.2.0
 *   node scripts/generate-update-manifest.mjs --version 1.3.0-beta.1 --prerelease
 *   node scripts/generate-update-manifest.mjs --version 1.2.0 --dry-run
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../lib/update/manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "config/update-manifest.json");

function parseArgs(argv) {
  const out = { version: null, tag: null, prerelease: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") out.version = argv[++i];
    else if (arg === "--tag") out.tag = argv[++i];
    else if (arg === "--prerelease") out.prerelease = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.version) {
  console.log(`Usage: node scripts/generate-update-manifest.mjs --version <semver> [--tag vX.Y.Z] [--prerelease] [--dry-run]`);
  process.exit(args.help ? 0 : 1);
}

const previous = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : null;

const manifest = buildManifest({
  version: args.version,
  tag: args.tag,
  prerelease: args.prerelease,
  previous
});

const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (args.dryRun) {
  process.stdout.write(json);
} else {
  writeFileSync(manifestPath, json);
  console.log(`Wrote ${manifestPath}`);
}
