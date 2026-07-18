import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { test, before, after } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mockPath = join(root, "scripts/mock-warp-cli.mjs");
let stateDir;
let stateFile;

function runMock(args, env = {}) {
  return spawnSync(process.execPath, [mockPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, MOCK_WARP_STATE: stateFile, ...env }
  });
}

before(() => {
  stateDir = mkdtempSync(join(tmpdir(), "mock-warp-"));
  stateFile = join(stateDir, "state.json");
});

after(() => {
  try {
    rmSync(stateDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("mock starts disconnected and connect flips status", () => {
  runMock(["mock-reset"]);
  let r = runMock(["status"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Disconnected/);

  r = runMock(["connect"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Success/);

  r = runMock(["status"]);
  assert.match(r.stdout, /Connected/);

  r = runMock(["disconnect"]);
  r = runMock(["status"]);
  assert.match(r.stdout, /Disconnected/);
});

test("mock persists mode and protocol", () => {
  runMock(["mock-reset"]);
  assert.equal(runMock(["mode", "doh"]).status, 0);
  assert.equal(runMock(["tunnel", "protocol", "set", "WireGuard"]).status, 0);
  const settings = runMock(["settings", "list"]).stdout;
  assert.match(settings, /Mode: doh/);
  assert.match(settings, /Protocol: WireGuard/);
});

test("mock split tunnel add/list/reset", () => {
  runMock(["mock-reset"]);
  runMock(["tunnel", "ip", "reset"]);
  runMock(["tunnel", "ip", "add", "192.168.0.0/16"]);
  const list = runMock(["tunnel", "ip", "list"]).stdout.trim();
  assert.equal(list, "192.168.0.0/16");
  runMock(["tunnel", "ip", "reset"]);
  assert.equal(runMock(["tunnel", "ip", "list"]).stdout.trim(), "");
});

test("mock registration delete and new", () => {
  runMock(["mock-reset"]);
  runMock(["registration", "delete"]);
  let show = runMock(["--json", "registration", "show"]).stdout.trim();
  assert.equal(show, "{}");
  runMock(["--accept-tos", "registration", "new"]);
  show = runMock(["--json", "registration", "show"]).stdout;
  assert.match(show, /mock-device-id/);
  assert.match(show, /"type": "free"/);
});
