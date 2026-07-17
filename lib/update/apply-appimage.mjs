import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, chmodSync, copyFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";

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
 * Download an AppImage asset and atomically replace the current binary.
 * Does not restart the process — caller should instruct the user to relaunch.
 */
export async function applyAppImageUpdate(asset, {
  env = process.env,
  fetchImpl = fetch,
  targetPath = null
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

  const response = await fetchImpl(asset.url, {
    headers: { "user-agent": "ThirdFlare-One-Updater" },
    redirect: "follow"
  });
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
    restartRequired: true
  };
}
