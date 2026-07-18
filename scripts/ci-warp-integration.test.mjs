import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mockWarp = join(root, "scripts/mock-warp-cli.mjs");
const port = Number(process.env.CI_TEST_PORT || 14733);
const baseUrl = `http://127.0.0.1:${port}`;
const integTempDir = mkdtempSync(join(tmpdir(), "tf-integ-"));
const stateFile = join(integTempDir, "state.json");
const configHome = join(integTempDir, "home");

/** @type {import('node:child_process').ChildProcess | null} */
let serverProc = null;

const MODES = ["warp", "doh", "warp+doh", "dot", "warp+dot", "proxy", "tunnel_only"];
const PROTOCOLS = ["MASQUE", "WireGuard"];
const FAMILIES = ["full", "malware", "off"];
const MASQUE_OPTIONS = ["h3-only", "h2-only", "h3-with-h2-fallback"];

const SIMPLE_ACTIONS = [
  "connect",
  "disconnect",
  "register",
  "deleteRegistration",
  "resetSettings",
  "rotateKeys",
  "resetProtocol",
  "resetSplitIps",
  "resetSplitHosts",
  "dnsLogEnable",
  "dnsLogDisable",
  "accessReauth",
  "resetGatewayId",
  "resetEndpoint",
  "resetMasqueOptions",
  "environmentNormal",
  "environmentFedramp",
  "environmentReset",
  "trustedWifiEnable",
  "trustedWifiDisable",
  "trustedEthernetEnable",
  "trustedEthernetDisable",
  "resetTrustedSsids",
  "allowLocalNetwork",
  "stopLocalNetworkOverride"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpJson(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = request(
      `${baseUrl}${path}`,
      {
        method,
        headers: body
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await httpJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok === true && res.json?.app === "thirdflare") {
        return;
      }
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error("Server did not become healthy in time");
}

async function action(name, value, secondary) {
  const body = { action: name };
  if (value !== undefined) body.value = value;
  if (secondary !== undefined) body.secondary = secondary;
  return httpJson("POST", "/api/action", body);
}

before(async () => {
  serverProc = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      HOME: configHome,
      PORT: String(port),
      WARP_CLI: mockWarp,
      MOCK_WARP_STATE: stateFile,
      THIRDFLARE_NOTIFICATIONS: "0",
      THIRDFLARE_NFT_NO_PKEXEC: "1",
      THIRDFLARE_WEBUI: "1"
    },
    stdio: "pipe"
  });

  serverProc.stderr?.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  await waitForHealth();
  await action("register");
  await action("disconnect");
});

after(async () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
    await sleep(300);
    if (!serverProc.killed) serverProc.kill("SIGKILL");
  }
  try {
    rmSync(integTempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("host DNS resolution works", async () => {
  const result = await lookup("one.one.one.one");
  assert.ok(result.address, "expected DNS A/AAAA record for one.one.one.one");
});

test("/api/health returns app identity", async () => {
  const res = await httpJson("GET", "/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.app, "thirdflare");
  assert.ok(res.json.version, "health should include semver");
});

test("/api/version returns channel and source", async () => {
  const res = await httpJson("GET", "/api/version");
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.ok(res.json.version);
  assert.equal(res.json.channel, "stable");
  assert.equal(res.json.source.owner, "oldrepublicwizard");
});

test("/api/snapshot reports warp daemon and network debug", async () => {
  const res = await httpJson("GET", "/api/snapshot");
  assert.equal(res.status, 200);
  assert.equal(res.json.daemon.available, true);
  assert.equal(res.json.status.disconnected, true);
  assert.match(res.json.commands.network.stdout, /DNS servers:/);
  assert.match(res.json.commands.network.stdout, /1\.1\.1\.1/);
});

test("connect then disconnect updates snapshot status", async () => {
  let res = await action("connect");
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  let snap = await httpJson("GET", "/api/snapshot");
  assert.equal(snap.json.status.connected, true);

  res = await action("disconnect");
  assert.equal(res.status, 200);
  snap = await httpJson("GET", "/api/snapshot");
  assert.equal(snap.json.status.disconnected, true);
});

test("every simple ACTIONS key succeeds", async () => {
  await action("register");
  for (const name of SIMPLE_ACTIONS) {
    const res = await action(name);
    assert.equal(res.status, 200, `${name} should return 200`);
    assert.equal(res.json.ok, true, `${name} should be ok`);
  }
});

test("every mode value sticks in settings", async () => {
  for (const mode of MODES) {
    const res = await action("setMode", mode);
    assert.equal(res.status, 200, `setMode ${mode}`);
    const snap = await httpJson("GET", "/api/snapshot");
    assert.match(snap.json.commands.settings.stdout, new RegExp(`Mode:\\s*${mode.replace("+", "\\+")}`));
  }
});

test("every protocol value sticks", async () => {
  for (const protocol of PROTOCOLS) {
    const res = await action("setProtocol", protocol);
    assert.equal(res.status, 200, `setProtocol ${protocol}`);
    const snap = await httpJson("GET", "/api/snapshot");
    assert.match(snap.json.commands.settings.stdout, new RegExp(`Protocol:\\s*${protocol}`));
  }
  await action("resetProtocol");
});

test("every DNS families value sticks", async () => {
  for (const families of FAMILIES) {
    const res = await action("setFamilies", families);
    assert.equal(res.status, 200, `setFamilies ${families}`);
    const snap = await httpJson("GET", "/api/snapshot");
    assert.match(snap.json.commands.settings.stdout, new RegExp(`DNS Families:\\s*${families}`));
  }
});

test("every MASQUE option sticks", async () => {
  for (const opt of MASQUE_OPTIONS) {
    const res = await action("setMasqueOptions", opt);
    assert.equal(res.status, 200, `setMasqueOptions ${opt}`);
    const snap = await httpJson("GET", "/api/snapshot");
    assert.match(snap.json.commands.settings.stdout, new RegExp(`MASQUE options:\\s*${opt}`));
  }
  await action("resetMasqueOptions");
});

test("split tunnel ip/host add remove reset", async () => {
  await action("resetSplitIps");
  await action("resetSplitHosts");
  assert.equal((await action("addSplitIp", "172.16.0.0/12")).status, 200);
  assert.equal((await action("addSplitHost", "intranet.example")).status, 200);
  let snap = await httpJson("GET", "/api/snapshot");
  assert.match(snap.json.commands.splitTunnelIps.stdout, /172\.16\.0\.0\/12/);
  assert.match(snap.json.commands.splitTunnelHosts.stdout, /intranet\.example/);
  assert.equal((await action("removeSplitIp", "172.16.0.0/12")).status, 200);
  assert.equal((await action("removeSplitHost", "intranet.example")).status, 200);
  snap = await httpJson("GET", "/api/snapshot");
  assert.doesNotMatch(snap.json.commands.splitTunnelIps.stdout, /172\.16\.0\.0\/12/);
  assert.doesNotMatch(snap.json.commands.splitTunnelHosts.stdout, /intranet\.example/);
  await action("resetSplitIps");
  await action("resetSplitHosts");
});

test("trusted SSID and DNS fallback add/remove", async () => {
  assert.equal((await action("addTrustedSsid", "CafeWifi")).status, 200);
  assert.equal((await action("addDnsFallback", "8.8.8.8")).status, 200);
  let snap = await httpJson("GET", "/api/snapshot");
  assert.match(snap.json.commands.trustedSsids.stdout, /CafeWifi/);
  assert.match(snap.json.commands.dnsFallback.stdout, /8\.8\.8\.8/);
  assert.equal((await action("removeTrustedSsid", "CafeWifi")).status, 200);
  assert.equal((await action("removeDnsFallback", "8.8.8.8")).status, 200);
  snap = await httpJson("GET", "/api/snapshot");
  assert.doesNotMatch(snap.json.commands.trustedSsids.stdout, /CafeWifi/);
  assert.doesNotMatch(snap.json.commands.dnsFallback.stdout, /8\.8\.8\.8/);
  await action("resetTrustedSsids");
});

test("invalid mode protocol families MASQUE are rejected", async () => {
  assert.equal((await action("setMode", "nope")).status, 400);
  assert.equal((await action("setProtocol", "BAD")).status, 400);
  assert.equal((await action("setFamilies", "evil")).status, 400);
  assert.equal((await action("setMasqueOptions", "x")).status, 400);
});

test("proxy port gateway endpoint vnet", async () => {
  assert.equal((await action("setProxyPort", "41000")).status, 200);
  assert.equal((await action("setGatewayId", "gw-ci-test")).status, 200);
  assert.equal((await action("setEndpoint", "engage.cloudflareclient.com:2408")).status, 200);
  assert.equal((await action("setVnet", "vnet-ci")).status, 200);
  await action("resetGatewayId");
  await action("resetEndpoint");
});

test("GET /api/account returns structured free registration", async () => {
  await action("register");
  const res = await httpJson("GET", "/api/account");
  assert.equal(res.status, 200);
  assert.equal(res.json.registered, true);
  assert.equal(res.json.consumer, true);
  assert.equal(res.json.license, "MOCKKEY1-MOCKKEY2-MOCKKEY3");
  assert.ok(Array.isArray(res.json.devices));
  assert.equal(res.json.devices[0].deviceId, "mock-device-id");
  const raw = res.json.commands?.registration?.stdout || "";
  assert.match(raw, /"public_key"\s*:\s*"\[redacted\]"/i);
  assert.match(raw, /"license"\s*:\s*"\[redacted\]"/i);
  assert.doesNotMatch(raw, /mock-public-key/);
  assert.doesNotMatch(raw, /MOCKKEY1/);
});

test("GET /api/killswitch reports desired/active state", async () => {
  const res = await httpJson("GET", "/api/killswitch");
  assert.equal(res.status, 200);
  assert.equal(typeof res.json.desired, "boolean");
  assert.ok(res.json.active === true || res.json.active === false || res.json.active === null);
  assert.equal(res.json.interface, "CloudflareWARP");
});

test("POST /api/killswitch disable is idempotent when inactive", async () => {
  const res = await httpJson("POST", "/api/killswitch", { enabled: false, allowLan: false });
  // 502 when nft probe/apply is unavailable (unprivileged CI); desired must stay false.
  assert.ok(res.status === 200 || res.status === 502, `unexpected status ${res.status}`);
  assert.equal(res.json.desired, false);
});

test("POST /api/killswitch enable without privilege keeps desired false", async () => {
  const res = await httpJson("POST", "/api/killswitch", { enabled: true, allowLan: false });
  assert.equal(res.status, 502);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.desired, false);
});

test("POST /api/killswitch rejects non-boolean enabled", async () => {
  const res = await httpJson("POST", "/api/killswitch", { enabled: "yes" });
  assert.equal(res.status, 400);
});

test("POST /api/killswitch/enrollment-pause begin is safe when KS off", async () => {
  const res = await httpJson("POST", "/api/killswitch/enrollment-pause", { mode: "begin" });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.paused, false);
});

test("GET /api/killswitch includes enrollmentPause object", async () => {
  const res = await httpJson("GET", "/api/killswitch");
  assert.equal(res.status, 200);
  assert.equal(typeof res.json.enrollmentPause, "object");
  assert.equal(typeof res.json.enrollmentPause.paused, "boolean");
});

test("POST /api/action applyLicense and registerOrganization validate input", async () => {
  const badLicense = await action("applyLicense", "bad;rm");
  assert.equal(badLicense.status, 400);

  const okLicense = await action("applyLicense", "MOCKKEY1-MOCKKEY2-MOCKKEY3");
  assert.equal(okLicense.status, 200);

  const badTeam = await action("registerOrganization", "bad team!");
  assert.equal(badTeam.status, 400);

  const okTeam = await action("registerOrganization", "acme-corp");
  assert.equal(okTeam.status, 200);
});

test("POST /api/action status via runCustom is rejected safely", async () => {
  const res = await action("runCustom", "status; rm -rf /");
  assert.equal(res.status, 400);
});

test("health-check script accepts this server", async () => {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts/health-check.mjs"), `${baseUrl}/api/health`], {
      stdio: "inherit"
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`health-check exit ${code}`))));
    child.on("error", reject);
  });
});
