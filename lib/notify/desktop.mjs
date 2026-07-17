import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function whichNotifySend(env = process.env) {
  const pathEnv = env.PATH || "";
  for (const dir of pathEnv.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "notify-send");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function notificationsAvailable(env = process.env) {
  if (env.THIRDFLARE_DISABLE_NOTIFICATIONS === "1") return false;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY && !env.XDG_RUNTIME_DIR) {
    // Still allow when notify-send exists (headless CI mocks); availability is binary presence.
  }
  return Boolean(whichNotifySend(env));
}

export function resolveNotifyIcon(env = process.env, root = repoRoot) {
  const candidates = [
    env.THIRDFLARE_NOTIFY_ICON,
    join(root, "assets", "thirdflare.svg"),
    "/usr/share/icons/hicolor/scalable/apps/thirdflare.svg",
    join(homedir(), ".local", "share", "icons", "hicolor", "scalable", "apps", "thirdflare.svg")
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Send a desktop notification via notify-send (argv only, no shell).
 */
export function sendDesktopNotification({ title, body, icon = null } = {}, {
  env = process.env,
  spawnImpl = spawn,
  root = repoRoot
} = {}) {
  const bin = whichNotifySend(env);
  if (!bin) {
    return { ok: false, skipped: true, reason: "notify-send not found" };
  }
  const args = [];
  const iconPath = icon || resolveNotifyIcon(env, root);
  if (iconPath) args.push("--icon", iconPath);
  args.push(String(title || "ThirdFlare One"), String(body || ""));

  try {
    const child = spawnImpl(bin, args, {
      stdio: "ignore",
      env,
      detached: true
    });
    child.unref?.();
    return { ok: true, skipped: false };
  } catch (error) {
    return { ok: false, skipped: false, reason: error.message };
  }
}

/** Sync probe for tests / status scripts. */
export function notifySendExists(env = process.env) {
  return Boolean(whichNotifySend(env));
}

export function probeNotifySendSync(env = process.env) {
  const bin = whichNotifySend(env);
  if (!bin) return false;
  const result = spawnSync(bin, ["--version"], { encoding: "utf8", env });
  return result.status === 0 || result.status === null;
}
