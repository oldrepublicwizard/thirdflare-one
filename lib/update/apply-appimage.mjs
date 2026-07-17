import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, chmodSync, copyFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { isTrustedAssetUrl } from "./github.mjs";

function cacheDir(env = process.env) {
  const base = env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "thirdflare", "updates");
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

/**
 * Resolve the AppImage path to replace.
 */
export function resolveAppImagePath(env = process.env) {
  if (env.THIRDFLARE_APPIMAGE_PATH && existsSync(env.THIRDFLARE_APPIMAGE_PATH)) {
    return env.THIRDFLARE_APPIMAGE_PATH;
  }
  if (env.APPIMAGE && existsSync(env.APPIMAGE)) {
    return env.APPIMAGE;
  }
  return null;
}

/**
 * Fetch a URL while re-validating every redirect hop against the GitHub allowlist.
 */
export async function fetchTrustedAsset(url, {
  fetchImpl = fetch,
  headers = { "user-agent": "ThirdFlare-One-Updater" },
  maxRedirects = 8
} = {}) {
  let current = String(url || "");
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!isTrustedAssetUrl(current)) {
      const error = new Error(`Untrusted download URL (hop ${hop}): ${current}`);
      error.code = "UNTRUSTED_URL";
      throw error;
    }
    const response = await fetchImpl(current, { headers, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.("location");
      if (!location) {
        const error = new Error(`Redirect without Location (${response.status})`);
        error.code = "BAD_REDIRECT";
        throw error;
      }
      current = new URL(location, current).href;
      continue;
    }
    return response;
  }
  const error = new Error("Too many redirects while downloading update.");
  error.code = "TOO_MANY_REDIRECTS";
  throw error;
}

/**
 * Parse a SHA256SUMS (or similar) text body for an asset basename.
 */
export function parseSha256Sums(text, assetName) {
  const needle = basename(assetName);
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) continue;
    const listed = basename(match[2].trim());
    if (listed === needle) return match[1].toLowerCase();
  }
  return null;
}

async function resolveExpectedSha256(asset, {
  fetchImpl,
  releaseAssets,
  expectedSha256
}) {
  if (expectedSha256 && /^[a-fA-F0-9]{64}$/.test(expectedSha256)) {
    return expectedSha256.toLowerCase();
  }
  const sumsAsset = (releaseAssets || []).find((a) =>
    /SHA256SUMS/i.test(a.name) && isTrustedAssetUrl(a.url)
  );
  if (!sumsAsset) return null;
  const response = await fetchTrustedAsset(sumsAsset.url, { fetchImpl });
  if (!response.ok) return null;
  const text = await response.text();
  return parseSha256Sums(text, asset.name);
}

/**
 * Download an AppImage asset and atomically replace the current binary.
 * Does not restart the process — caller should instruct the user to relaunch.
 */
export async function applyAppImageUpdate(asset, {
  env = process.env,
  fetchImpl = fetch,
  targetPath = null,
  releaseAssets = [],
  expectedSha256 = null
} = {}) {
  const target = targetPath || resolveAppImagePath(env);
  if (!target) {
    const error = new Error("No AppImage path detected. Set THIRDFLARE_APPIMAGE_PATH or run from an AppImage.");
    error.code = "NO_APPIMAGE";
    throw error;
  }

  if (!asset?.url || !asset?.name) {
    const error = new Error("Missing AppImage asset URL.");
    error.code = "NO_ASSET";
    throw error;
  }

  if (!/\.AppImage$/i.test(asset.name)) {
    const error = new Error(`Asset does not look like an AppImage: ${asset.name}`);
    error.code = "BAD_ASSET";
    throw error;
  }

  const dir = cacheDir(env);
  ensureDir(dir);
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tmpPath = join(dir, `${basename(asset.name)}.${unique}.partial`);
  const finalCache = join(dir, `${basename(asset.name)}.${unique}`);

  const response = await fetchTrustedAsset(asset.url, { fetchImpl });
  if (!response.ok || !response.body) {
    const error = new Error(`Download failed (${response.status})`);
    error.code = "DOWNLOAD_FAILED";
    throw error;
  }

  try {
    await pipeline(response.body, createWriteStream(tmpPath));
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw error;
  }

  const hash = createHash("sha256");
  hash.update(await readFile(tmpPath));
  const sha256 = hash.digest("hex");

  const expected = await resolveExpectedSha256(asset, {
    fetchImpl,
    releaseAssets,
    expectedSha256
  });
  if (expected && expected !== sha256) {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    const error = new Error(`SHA256 mismatch for ${asset.name}: expected ${expected}, got ${sha256}`);
    error.code = "SHA256_MISMATCH";
    throw error;
  }

  renameSync(tmpPath, finalCache);
  chmodSync(finalCache, 0o755);

  const backup = `${target}.bak`;
  try {
    if (existsSync(target)) {
      copyFileSync(target, backup);
    }
    renameSync(finalCache, target);
    chmodSync(target, 0o755);
  } catch (error) {
    if (existsSync(backup)) {
      try { renameSync(backup, target); } catch { /* ignore */ }
    }
    throw error;
  }

  return {
    mode: "appimage",
    applied: true,
    path: target,
    backup,
    sha256,
    sha256Verified: Boolean(expected),
    restartRequired: true
  };
}
