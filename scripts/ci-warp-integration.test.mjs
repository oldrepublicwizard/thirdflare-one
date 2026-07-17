import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mockWarp = join(root, "scripts/mock-warp-cli.sh");
const port = Number(process.env.CI_TEST_PORT || 14733);
const baseUrl = `http://127.0.0.1:${port}`;

/** @type {import('node:child_process').ChildProcess | null} */
let serverProc = null;

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

async function waitForHealth(timeoutMs = 15000) {
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

before(async () => {
  serverProc = spawn("node", ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      WARP_CLI: mockWarp,
      THIRDFLARE_NOTIFICATIONS: "0",
      THIRDFLARE_NFT_NO_PKEXEC: "1"
    },
    stdio: "pipe"
  });

  serverProc.stderr?.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  await waitForHealth();
});

after(async () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
    await sleep(300);
    if (!serverProc.killed) serverProc.kill("SIGKILL");
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

test("POST /api/action connect invokes mock warp-cli", async () => {
  const res = await httpJson("POST", "/api/action", { action: "connect" });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.match(res.json.result.stdout, /Success/);
});

test("GET /api/account returns structured free registration", async () => {
  const res = await httpJson("GET", "/api/account");
  assert.equal(res.status, 200);
  assert.equal(res.json.registered, true);
  assert.equal(res.json.consumer, true);
  assert.equal(res.json.license, "MOCKKEY1-MOCKKEY2-MOCKKEY3");
  assert.ok(Array.isArray(res.json.devices));
  assert.equal(res.json.devices[0].deviceId, "mock-device-id");
  // Structured fields stay usable; raw command blobs redact secrets (JSON + text).
  const raw = res.json.commands?.registration?.stdout || "";
  assert.match(raw, /"public_key"\s*:\s*"\[redacted\]"/i);
  assert.doesNotMatch(raw, /mock-public-key/);
});

test("GET /api/killswitch reports desired/active state", async () => {
  const res = await httpJson("GET", "/api/killswitch");
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(typeof res.json.desired, "boolean");
  assert.equal(typeof res.json.active, "boolean");
  assert.equal(res.json.interface, "CloudflareWARP");
});

test("POST /api/killswitch disable is idempotent when inactive", async () => {
  const res = await httpJson("POST", "/api/killswitch", { enabled: false, allowLan: false });
  // May be 200 (removed/noop) or 502 if nft is missing entirely — both acceptable in CI.
  assert.ok(res.status === 200 || res.status === 502, `unexpected status ${res.status}`);
  assert.equal(res.json.desired, false);
});

test("POST /api/action applyLicense and registerOrganization validate input", async () => {
  const badLicense = await httpJson("POST", "/api/action", {
    action: "applyLicense",
    value: "bad;rm"
  });
  assert.equal(badLicense.status, 400);

  const okLicense = await httpJson("POST", "/api/action", {
    action: "applyLicense",
    value: "MOCKKEY1-MOCKKEY2-MOCKKEY3"
  });
  assert.equal(okLicense.status, 200);

  const badTeam = await httpJson("POST", "/api/action", {
    action: "registerOrganization",
    value: "bad team!"
  });
  assert.equal(badTeam.status, 400);

  const okTeam = await httpJson("POST", "/api/action", {
    action: "registerOrganization",
    value: "acme-corp"
  });
  assert.equal(okTeam.status, 200);
});

test("POST /api/action status via runCustom is rejected safely", async () => {
  const res = await httpJson("POST", "/api/action", {
    action: "runCustom",
    value: "status; rm -rf /"
  });
  assert.equal(res.status, 400);
});

test("health-check script accepts this server", async () => {
  await new Promise((resolve, reject) => {
    const child = spawn("node", [join(root, "scripts/health-check.mjs"), `${baseUrl}/api/health`], {
      stdio: "inherit"
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`health-check exit ${code}`))));
    child.on("error", reject);
  });
});
