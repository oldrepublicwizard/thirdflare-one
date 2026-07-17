import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_DISPLAY_NAME,
  APP_ID,
  clearSessionOverrides,
  describeConfigSources,
  effectiveBind,
  getConfig,
  reloadConfig,
  setSessionOverrides
} from "./lib/config.mjs";
import { getVersion, getVersionInfo } from "./lib/version.mjs";
import { applyUpdate, checkForUpdate, prepareApply } from "./lib/update/index.mjs";
import { listForks, listReleases } from "./lib/update/github.mjs";
import { detectInstallFormat } from "./lib/update/detect-format.mjs";
import { isSafeGithubRef } from "./lib/update/detect-format.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const config = reloadConfig();
const port = Number(config.server?.port || 4173);
const listenHost = effectiveBind(config);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const COMMANDS = {
  status: ["status"],
  settings: ["settings", "list"],
  registration: ["registration", "show"],
  organization: ["registration", "organization"],
  stats: ["stats"],
  tunnelStats: ["tunnel", "stats"],
  dnsStats: ["dns", "stats"],
  dnsFallback: ["dns", "fallback", "list"],
  dnsDefaultFallbacks: ["dns", "default-fallbacks"],
  splitTunnelDump: ["tunnel", "dump"],
  splitTunnelIps: ["tunnel", "ip", "list"],
  splitTunnelHosts: ["tunnel", "host", "list"],
  targets: ["target", "list"],
  vnet: ["vnet"],
  mdm: ["mdm", "get-configs"],
  supportUrl: ["settings", "support-url"],
  modeSwitchAllowed: ["settings", "mode-switch-allowed"],
  override: ["override", "show"],
  localNetworkOverride: ["override", "local-network", "show"],
  trustedSsids: ["trusted", "ssid", "list"],
  posture: ["debug", "posture"],
  network: ["debug", "network"],
  alternateNetwork: ["debug", "alternate-network"],
  dex: ["debug", "dex"],
  certs: ["certs"]
};

const ACTIONS = {
  connect: ["connect"],
  disconnect: ["disconnect"],
  register: ["registration", "new"],
  deleteRegistration: ["registration", "delete"],
  resetSettings: ["settings", "reset"],
  rotateKeys: ["tunnel", "rotate-keys"],
  resetProtocol: ["tunnel", "protocol", "reset"],
  resetSplitIps: ["tunnel", "ip", "reset"],
  resetSplitHosts: ["tunnel", "host", "reset"],
  dnsLogEnable: ["dns", "log", "enable"],
  dnsLogDisable: ["dns", "log", "disable"],
  accessReauth: ["debug", "access-reauth"],
  resetGatewayId: ["dns", "gateway-id", "reset"],
  resetEndpoint: ["tunnel", "endpoint", "reset"],
  resetMasqueOptions: ["tunnel", "masque-options", "reset"],
  environmentNormal: ["environment", "set", "Normal"],
  environmentFedramp: ["environment", "set", "FedRAMP-High"],
  environmentReset: ["environment", "reset"],
  trustedWifiEnable: ["trusted", "wifi", "enable"],
  trustedWifiDisable: ["trusted", "wifi", "disable"],
  trustedEthernetEnable: ["trusted", "ethernet", "enable"],
  trustedEthernetDisable: ["trusted", "ethernet", "disable"],
  resetTrustedSsids: ["trusted", "ssid", "reset"],
  allowLocalNetwork: ["override", "local-network", "allow"],
  stopLocalNetworkOverride: ["override", "local-network", "stop"]
};

const MODES = new Set(["warp", "doh", "warp+doh", "dot", "warp+dot", "proxy", "tunnel_only"]);
const PROTOCOLS = new Set(["MASQUE", "WireGuard"]);
const FAMILIES = new Set(["full", "malware", "off"]);
const MASQUE_OPTIONS = new Set(["h3-only", "h2-only", "h3-with-h2-fallback"]);

function warpCliCommand() {
  return getConfig().warp?.cli || process.env.WARP_CLI || "warp-cli";
}

function spawnWarpCli(warpArgs, options = {}) {
  const cmd = warpCliCommand();
  if (process.env.FLATPAK_ID && cmd === "warp-cli") {
    return spawn("flatpak-spawn", ["--host", "--", "warp-cli", ...warpArgs], options);
  }
  return spawn(cmd, warpArgs, options);
}

function runWarp(args, options = {}) {
  const finalArgs = ["--no-ansi", "--no-paginate", ...args];
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawnWarpCli(finalArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout || 15000
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        command: `warp-cli ${finalArgs.join(" ")}`,
        code: null,
        stdout: "",
        stderr: error.message,
        durationMs: Date.now() - startedAt
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        command: `warp-cli ${finalArgs.join(" ")}`,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function parseStatus(text) {
  const clean = text.replace(/\r/g, "").trim();
  const lower = clean.toLowerCase();
  const disconnected = /\b(disconnected|not connected)\b/.test(lower);
  const connecting = !disconnected && /\b(connecting|reconnecting)\b/.test(lower);
  const connected = !disconnected && !connecting && /\bconnected\b/.test(lower);
  const registrationMissing = lower.includes("registration missing") || lower.includes("not registered");
  const healthy = lower.includes("network: healthy") || lower === "healthy";
  const unhealthy = lower.includes("unhealthy") || lower.includes("degraded");

  return {
    label: clean || "Unavailable",
    connected,
    connecting,
    disconnected,
    registrationMissing,
    severity: connected || healthy ? "good" : connecting || unhealthy ? "warn" : "bad"
  };
}

function parseSettings(text) {
  const settings = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (match) settings[match[1].trim()] = match[2].trim();
  }
  return settings;
}

function parseKeyValueLines(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function parseTunnelStats(text) {
  const values = parseKeyValueLines(text);
  const traffic = text.match(/Sent:\s*([^;]+);\s*Received:\s*([^\n]+)/i);

  return {
    protocol: values["Tunnel Protocol"] || null,
    endpoints: values.Endpoints || null,
    handshakeAge: values["Time since last handshake"] || null,
    sent: traffic?.[1]?.trim() || null,
    received: traffic?.[2]?.trim() || null,
    latency: values["Estimated latency"] || null,
    loss: values["Estimated loss"] || null,
    colo: values.Colo || null,
    tlsVersion: values.Version || null,
    postQuantum: values["Post-Quantum enabled"] || null
  };
}

function parseDnsStats(text) {
  const values = parseKeyValueLines(text);
  return {
    queries: values.Queries || null,
    averageDuration: values["Average Duration"] || null,
    success: values.Success || null,
    timedOut: values["Timed Out"] || null,
    noRecords: values["No Records Found"] || null,
    otherError: values["Other Error"] || null
  };
}

function redactWarpOutput(text) {
  return text
    .replace(/(^|\n)(ID:\s+).+/gi, "$1$2[redacted]")
    .replace(/(Device ID:\s+).+/gi, "$1[redacted]")
    .replace(/(Public key:\s+).+/gi, "$1[redacted]")
    .replace(/(License:\s+).+/gi, "$1[redacted]")
    .replace(/(Account ID:\s+).+/gi, "$1[redacted]");
}

function redactCommand(result) {
  return {
    ...result,
    stdout: redactWarpOutput(result.stdout),
    stderr: redactWarpOutput(result.stderr)
  };
}

function parseWarpArgs(value) {
  if (typeof value !== "string" || value.length > 240) return null;
  if (/[;&|<>`$\\\n\r]/.test(value)) return null;

  const args = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(value))) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }
  if (args[0] === "warp-cli") args.shift();
  return args.length ? args : null;
}

function daemonError(result) {
  const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return combined.includes("unable to connect to the cloudflarewarp daemon")
    || combined.includes("maybe the daemon is not running")
    || combined.includes("operation not permitted");
}

async function snapshot() {
  const entries = await Promise.all(
    Object.entries(COMMANDS).map(async ([key, args]) => [key, await runWarp(args)])
  );
  const commands = Object.fromEntries(entries.map(([key, result]) => [key, redactCommand(result)]));
  const status = parseStatus(commands.status.stdout || commands.status.stderr);
  const settings = parseSettings(commands.settings.stdout);
  const daemon = {
    available: !daemonError(commands.status),
    message: daemonError(commands.status)
      ? (commands.status.stderr || commands.status.stdout)
      : "CloudflareWARP daemon responded."
  };

  return {
    generatedAt: new Date().toISOString(),
    daemon,
    status,
    settings,
    parsed: {
      tunnel: parseTunnelStats(commands.tunnelStats.stdout),
      dns: parseDnsStats(commands.dnsStats.stdout)
    },
    commands
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

function sse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function actionArgs(body) {
  const { action, value, secondary } = body || {};

  if (ACTIONS[action]) return ACTIONS[action];
  if (action === "setMode" && MODES.has(value)) return ["mode", value];
  if (action === "setProtocol" && PROTOCOLS.has(value)) return ["tunnel", "protocol", "set", value];
  if (action === "setFamilies" && FAMILIES.has(value)) return ["dns", "families", value];
  if (action === "setMasqueOptions" && MASQUE_OPTIONS.has(value)) return ["tunnel", "masque-options", "set", value];
  if (action === "setProxyPort" && /^\d{2,5}$/.test(String(value))) return ["proxy", "port", String(value)];
  if (action === "setVnet" && value) return ["vnet", String(value)];
  if (action === "setGatewayId" && value) return ["dns", "gateway-id", "set", String(value)];
  if (action === "setEndpoint" && value) return ["tunnel", "endpoint", "set", String(value)];
  if (action === "overrideCode" && value) return ["override", String(value)];
  if (action === "overrideUnlock" && value) return ["override", "unlock", String(value)];
  if (action === "runCustom") return parseWarpArgs(value);
  if (action === "addDnsFallback" && value) return ["dns", "fallback", "add", String(value)];
  if (action === "removeDnsFallback" && value) return ["dns", "fallback", "remove", String(value)];
  if (action === "addSplitIp" && value) return ["tunnel", "ip", "add", String(value)];
  if (action === "removeSplitIp" && value) return ["tunnel", "ip", "remove", String(value)];
  if (action === "addSplitIpRange" && value) return ["tunnel", "ip", "add-range", String(value), String(secondary || value)];
  if (action === "removeSplitIpRange" && value) return ["tunnel", "ip", "remove-range", String(value), String(secondary || value)];
  if (action === "addSplitHost" && value) return ["tunnel", "host", "add", String(value)];
  if (action === "removeSplitHost" && value) return ["tunnel", "host", "remove", String(value)];
  if (action === "addTrustedSsid" && value) return ["trusted", "ssid", "add", String(value)];
  if (action === "removeTrustedSsid" && value) return ["trusted", "ssid", "remove", String(value)];

  return null;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, {
        ok: true,
        app: APP_ID,
        name: APP_DISPLAY_NAME,
        version: getVersion(),
        generatedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/version") {
      const active = getConfig();
      json(res, 200, {
        ok: true,
        ...getVersionInfo(active),
        installFormat: detectInstallFormat()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/update/check") {
      const result = await checkForUpdate(getConfig());
      json(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/update/releases") {
      const active = getConfig();
      const owner = url.searchParams.get("owner") || active.updates?.source?.owner;
      const repo = url.searchParams.get("repo") || active.updates?.source?.repo;
      if (!isSafeGithubRef(owner) || !isSafeGithubRef(repo)) {
        json(res, 400, { ok: false, error: "Invalid owner/repo." });
        return;
      }
      const releases = await listReleases({ owner, repo });
      json(res, 200, { ok: true, source: { owner, repo }, releases });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/update/forks") {
      const active = getConfig();
      const owner = url.searchParams.get("owner") || active.updates?.source?.owner || "oldrepublicwizard";
      const repo = url.searchParams.get("repo") || active.updates?.source?.repo || "cloudflare-one-gui-linux";
      if (!isSafeGithubRef(owner) || !isSafeGithubRef(repo)) {
        json(res, 400, { ok: false, error: "Invalid owner/repo." });
        return;
      }
      const forks = await listForks({ owner, repo });
      json(res, 200, {
        ok: true,
        upstream: { owner, repo },
        forks: [
          { owner, repo, fullName: `${owner}/${repo}`, stars: null, upstream: true },
          ...forks
        ]
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/update/prepare") {
      const body = await readJson(req);
      const result = await prepareApply(getConfig(), body, { bindHost: listenHost });
      json(res, result.ok === false ? 400 : 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/update/apply") {
      const body = await readJson(req);
      const result = await applyUpdate(getConfig(), body, { bindHost: listenHost });
      json(res, result.ok === false ? 400 : 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      const active = getConfig();
      json(res, 200, {
        ok: true,
        config: active,
        sources: describeConfigSources(),
        effective: {
          bind: effectiveBind(active),
          port: Number(active.server?.port || port)
        },
        notes: {
          restartRequired: ["server.port", "server.bind", "webui.allowRemote"],
          sessionOnly: "POST /api/config/session overrides apply until the daemon restarts."
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/session") {
      const body = await readJson(req);
      if (body?.clear === true) {
        clearSessionOverrides();
      } else {
        setSessionOverrides(body?.config || body);
      }
      json(res, 200, {
        ok: true,
        config: getConfig(),
        sources: describeConfigSources()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "connection": "keep-alive",
        "x-accel-buffering": "no"
      });
      sse(res, "ready", { ok: true, generatedAt: new Date().toISOString() });

      const child = spawnWarpCli(["--no-ansi", "--no-paginate", "--listen", "status"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      const heartbeat = setInterval(() => {
        sse(res, "heartbeat", { generatedAt: new Date().toISOString() });
      }, 25000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() || "";
        for (const line of lines) {
          const clean = redactWarpOutput(line.trim());
          if (clean) sse(res, "warp", { line: clean, status: parseStatus(clean), generatedAt: new Date().toISOString() });
        }
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        const lines = stderr.split(/\r?\n/);
        stderr = lines.pop() || "";
        for (const line of lines) {
          const clean = redactWarpOutput(line.trim());
          if (clean) sse(res, "error", { line: clean, generatedAt: new Date().toISOString() });
        }
      });

      child.on("error", (error) => {
        sse(res, "error", { line: error.message, generatedAt: new Date().toISOString() });
      });

      child.on("close", (code) => {
        clearInterval(heartbeat);
        sse(res, "closed", { code, generatedAt: new Date().toISOString() });
        res.end();
      });

      req.on("close", () => {
        clearInterval(heartbeat);
        child.kill();
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      json(res, 200, await snapshot());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/action") {
      const body = await readJson(req);
      const args = actionArgs(body);
      if (!args) {
        json(res, 400, { ok: false, error: "Unsupported or invalid action." });
        return;
      }
      const result = await runWarp(args, { timeout: 30000 });
      json(res, result.ok ? 200 : 502, { ok: result.ok, result: redactCommand(result) });
      return;
    }

    json(res, 404, { ok: false, error: "Unknown API route." });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}

async function serveStatic(req, res, url) {
  const active = getConfig();
  if (!active.webui?.enabled && url.pathname !== "/" && !url.pathname.startsWith("/api/")) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("ThirdFlare One Web UI is disabled. Enable webui.enabled in config or the in-app Settings page.");
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicRoot, safePath);

  if (!filePath.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    const index = await readFile(join(publicRoot, "index.html"));
    res.writeHead(200, { "content-type": MIME[".html"] });
    res.end(index);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(port, listenHost, () => {
  console.log(`${APP_DISPLAY_NAME} running at http://${listenHost}:${port}`);
  if (!getConfig().webui?.enabled) {
    console.log("Web UI disabled (webui.enabled=false). API and launcher quick actions remain available.");
  }
});
