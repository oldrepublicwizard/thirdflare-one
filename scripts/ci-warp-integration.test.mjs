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
      THIRDFLARE_NOTIFICATIONS: "0"
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
