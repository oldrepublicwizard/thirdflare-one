import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_ID = "thirdflare";
export const APP_DISPLAY_NAME = "ThirdFlare One";

const DEFAULTS = {
  server: {
    port: 4173,
    bind: "127.0.0.1"
  },
  webui: {
    enabled: false,
    allowRemote: false
  },
  warp: {
    cli: "warp-cli",
    killSwitch: false,
    killSwitchAllowLan: false
  },
  ui: {
    openBrowser: true,
    theme: "system",
    locale: "en",
    notifications: true
  },
  updates: {
    channel: "stable",
    source: {
      owner: "oldrepublicwizard",
      repo: "thirdflare-one"
    },
    checkOnStartup: true
  }
};

const sessionOverrides = {};

function readJsonFile(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base, ...layers) {
  const out = structuredClone(base);
  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (isPlainObject(value) && isPlainObject(out[key])) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    }
  }
  return out;
}

function envOverrides(env) {
  const out = {};
  const port = Number(env.THIRDFLARE_PORT || env.CLOUDFLARE_ONE_GUI_PORT || env.PORT);
  if (Number.isFinite(port) && port > 0) {
    out.server = { ...(out.server || {}), port };
  }

  const bind = env.THIRDFLARE_BIND || env.CLOUDFLARE_ONE_GUI_BIND;
  if (bind) {
    out.server = { ...(out.server || {}), bind };
  }

  const warpCli = env.THIRDFLARE_WARP_CLI || env.WARP_CLI;
  if (warpCli) {
    out.warp = { ...(out.warp || {}), cli: warpCli };
  }

  if (env.THIRDFLARE_WEBUI === "1" || env.THIRDFLARE_WEBUI === "true") {
    out.webui = { ...(out.webui || {}), enabled: true };
  }
  if (env.THIRDFLARE_WEBUI === "0" || env.THIRDFLARE_WEBUI === "false") {
    out.webui = { ...(out.webui || {}), enabled: false };
  }
  if (env.THIRDFLARE_WEBUI_ALLOW_REMOTE === "1" || env.THIRDFLARE_WEBUI_ALLOW_REMOTE === "true") {
    out.webui = { ...(out.webui || {}), allowRemote: true };
  }

  if (env.THIRDFLARE_LOCALE) {
    out.ui = { ...(out.ui || {}), locale: env.THIRDFLARE_LOCALE };
  }

  if (env.THIRDFLARE_NOTIFICATIONS === "0" || env.THIRDFLARE_NOTIFICATIONS === "false") {
    out.ui = { ...(out.ui || {}), notifications: false };
  }
  if (env.THIRDFLARE_NOTIFICATIONS === "1" || env.THIRDFLARE_NOTIFICATIONS === "true") {
    out.ui = { ...(out.ui || {}), notifications: true };
  }

  const channel = env.THIRDFLARE_UPDATE_CHANNEL;
  if (channel === "stable" || channel === "beta") {
    out.updates = { ...(out.updates || {}), channel };
  }

  const source = env.THIRDFLARE_UPDATE_SOURCE;
  if (source && source.includes("/")) {
    const [owner, repo] = source.split("/", 2);
    if (owner && repo) {
      out.updates = {
        ...(out.updates || {}),
        source: { owner, repo }
      };
    }
  }

  if (env.THIRDFLARE_UPDATE_CHECK === "0" || env.THIRDFLARE_UPDATE_CHECK === "false") {
    out.updates = { ...(out.updates || {}), checkOnStartup: false };
  }

  return out;
}

export function configPaths() {
  return {
    system: "/etc/thirdflare/config.json",
    user: join(homedir(), ".config", "thirdflare", "config.json"),
    legacyUser: join(homedir(), ".config", "cloudflare-one-gui", "config.json")
  };
}

export function loadConfig(env = process.env) {
  const paths = configPaths();
  return deepMerge(
    DEFAULTS,
    readJsonFile(paths.system),
    // Legacy path loads before the new user file so ~/.config/thirdflare wins.
    readJsonFile(paths.legacyUser),
    readJsonFile(paths.user),
    envOverrides(env),
    sessionOverrides
  );
}

/**
 * Update source from file/env layers only (ignores session).
 * Used as the fork-graph root so session cannot invent an unrelated upstream.
 */
export function getPinnedUpdateSource(env = process.env) {
  const paths = configPaths();
  const pinned = deepMerge(
    DEFAULTS,
    readJsonFile(paths.system),
    readJsonFile(paths.legacyUser),
    readJsonFile(paths.user),
    envOverrides(env)
  );
  return {
    owner: pinned.updates?.source?.owner || "oldrepublicwizard",
    repo: pinned.updates?.source?.repo || "thirdflare-one"
  };
}

/**
 * Keys allowed via POST /api/config/session.
 * Never warp.cli / server / webui.
 * updates.source is set only via POST /api/update/source (fork-graph validated).
 */
const SESSION_ALLOWLIST = {
  ui: new Set(["locale", "theme", "openBrowser", "notifications"]),
  updates: new Set(["channel", "checkOnStartup", "source"])
  // warp.killSwitch* is session-set only via POST /api/killswitch after nft apply succeeds.
};

function sanitizeSessionPartial(partial) {
  if (!isPlainObject(partial)) return {};
  const out = {};
  for (const [section, keys] of Object.entries(SESSION_ALLOWLIST)) {
    if (!isPlainObject(partial[section])) continue;
    const sectionOut = {};
    for (const [key, value] of Object.entries(partial[section])) {
      if (!keys.has(key)) continue;
      if (key === "source") {
        // Source must be applied through setSessionUpdateSource (validated).
        continue;
      }
      if (key === "channel" && value !== "stable" && value !== "beta") continue;
      if (key === "locale" && (typeof value !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(value))) continue;
      if ((key === "notifications" || key === "openBrowser" || key === "checkOnStartup") && typeof value !== "boolean") continue;
      sectionOut[key] = value;
    }
    if (Object.keys(sectionOut).length) out[section] = sectionOut;
  }
  return out;
}

/**
 * Set session updates.source after caller validates against the fork graph.
 */
export function setSessionUpdateSource(source) {
  if (!isPlainObject(source)) return getConfig();
  const owner = String(source.owner || "");
  const repo = String(source.repo || "");
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
    return getConfig();
  }
  const prev = sessionOverrides.updates && isPlainObject(sessionOverrides.updates)
    ? { ...sessionOverrides.updates }
    : {};
  sessionOverrides.updates = { ...prev, source: { owner, repo } };
  cached = loadConfig();
  return cached;
}

/**
 * Session kill-switch desired state — only from POST /api/killswitch after nft apply.
 * Not allowed via generic /api/config/session (would imply protection without rules).
 */
export function setSessionKillSwitch({ enabled, allowLan } = {}) {
  if (typeof enabled !== "boolean") return getConfig();
  const prev = sessionOverrides.warp && isPlainObject(sessionOverrides.warp)
    ? { ...sessionOverrides.warp }
    : {};
  sessionOverrides.warp = {
    ...prev,
    killSwitch: enabled,
    killSwitchAllowLan: typeof allowLan === "boolean" ? allowLan : Boolean(prev.killSwitchAllowLan)
  };
  cached = loadConfig();
  return cached;
}

export function setSessionOverrides(partial) {
  if (!isPlainObject(partial)) return getConfig();
  const safe = sanitizeSessionPartial(partial);
  const merged = deepMerge(sessionOverrides, safe);
  for (const key of Object.keys(sessionOverrides)) {
    delete sessionOverrides[key];
  }
  Object.assign(sessionOverrides, merged);
  cached = loadConfig();
  return cached;
}

export function clearSessionOverrides() {
  for (const key of Object.keys(sessionOverrides)) {
    delete sessionOverrides[key];
  }
  cached = loadConfig();
  return cached;
}

let cached = loadConfig();

export function getConfig() {
  return cached;
}

export function reloadConfig(env = process.env) {
  cached = loadConfig(env);
  return cached;
}

export function effectiveBind(config = getConfig()) {
  if (config.webui?.enabled && config.webui?.allowRemote) {
    return "0.0.0.0";
  }
  return config.server?.bind || "127.0.0.1";
}

export function describeConfigSources() {
  const paths = configPaths();
  return {
    defaults: true,
    systemFile: existsSync(paths.system),
    userFile: existsSync(paths.user),
    legacyUserFile: existsSync(paths.legacyUser),
    environment: true,
    session: Object.keys(sessionOverrides).length > 0
  };
}
