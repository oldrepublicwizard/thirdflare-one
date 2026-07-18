import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mockWarp = join(root, "scripts/mock-warp-cli.mjs");
const port = Number(process.env.CI_OPENAPI_PORT || 14735);
const baseUrl = `http://127.0.0.1:${port}`;
const stateFile = join(mkdtempSync(join(tmpdir(), "tf-openapi-")), "state.json");
const spec = JSON.parse(readFileSync(join(root, "openapi/thirdflare-api.json"), "utf8"));

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

function assertRequired(obj, required, label) {
  for (const key of required) {
    assert.ok(key in obj, `${label} missing required property "${key}"`);
  }
}

function schemaRequired(path, method = "get") {
  const op = spec.paths[path]?.[method];
  const schema = op?.responses?.["200"]?.content?.["application/json"]?.schema;
  return schema?.required || [];
}

before(async () => {
  serverProc = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      WARP_CLI: mockWarp,
      MOCK_WARP_STATE: stateFile,
      THIRDFLARE_NOTIFICATIONS: "0",
      THIRDFLARE_NFT_NO_PKEXEC: "1"
    },
    stdio: "pipe"
  });
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const res = await httpJson("GET", "/api/health");
      if (res.status === 200) break;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
});

after(async () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
    await sleep(200);
    if (!serverProc.killed) serverProc.kill("SIGKILL");
  }
  try {
    rmSync(dirname(stateFile), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("OpenAPI /api/health response shape", async () => {
  const res = await httpJson("GET", "/api/health");
  assert.equal(res.status, 200);
  assertRequired(res.json, schemaRequired("/api/health"), "health");
  assert.equal(res.json.app, "thirdflare");
});

test("OpenAPI /api/version response shape", async () => {
  const res = await httpJson("GET", "/api/version");
  assert.equal(res.status, 200);
  assertRequired(res.json, schemaRequired("/api/version"), "version");
});

test("OpenAPI /api/account response shape", async () => {
  const res = await httpJson("GET", "/api/account");
  assert.equal(res.status, 200);
  assertRequired(res.json, schemaRequired("/api/account"), "account");
});

test("OpenAPI /api/snapshot response shape", async () => {
  const res = await httpJson("GET", "/api/snapshot");
  assert.equal(res.status, 200);
  assertRequired(res.json, schemaRequired("/api/snapshot"), "snapshot");
});

test("OpenAPI /api/killswitch response shape", async () => {
  const res = await httpJson("GET", "/api/killswitch");
  assert.equal(res.status, 200);
  assertRequired(res.json, schemaRequired("/api/killswitch"), "killswitch");
});

test("OpenAPI /api/config response shape", async () => {
  const res = await httpJson("GET", "/api/config");
  assert.equal(res.status, 200);
  assertRequired(res.json, ["ok", "config"], "config");
});

test("OpenAPI /api/action connect response shape", async () => {
  const res = await httpJson("POST", "/api/action", { action: "connect" });
  assert.equal(res.status, 200);
  assertRequired(res.json, schemaRequired("/api/action", "post"), "action");
});
