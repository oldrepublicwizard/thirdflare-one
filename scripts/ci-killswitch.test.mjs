import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOOTSTRAP_V4,
  BOOTSTRAP_V6,
  KILLSWITCH_TABLE,
  WARP_INTERFACE,
  buildDisableScript,
  buildEnableScript
} from "../lib/killswitch/rules.mjs";

test("enable script drops by default and allows lo + WARP + bootstrap", () => {
  const script = buildEnableScript({ allowLan: false, useDestroy: true });
  assert.match(script, new RegExp(`destroy table inet ${KILLSWITCH_TABLE}`));
  assert.match(script, /policy drop/);
  assert.match(script, /oifname "lo" accept/);
  assert.match(script, new RegExp(`oifname "${WARP_INTERFACE}" accept`));
  for (const cidr of BOOTSTRAP_V4) {
    assert.match(script, new RegExp(cidr.replace(/\./g, "\\.")));
  }
  for (const cidr of BOOTSTRAP_V6) {
    assert.ok(script.includes(cidr), `missing bootstrap v6 ${cidr}`);
  }
  assert.doesNotMatch(script, /10\.0\.0\.0\/8/);
});

test("enable script can allow LAN ranges", () => {
  const script = buildEnableScript({ allowLan: true, useDestroy: false });
  assert.match(script, /delete table inet/);
  assert.match(script, /10\.0\.0\.0\/8/);
  assert.match(script, /192\.168\.0\.0\/16/);
  assert.match(script, /fc00::\/7/);
});

test("disable script destroys or deletes the table", () => {
  assert.match(buildDisableScript({ useDestroy: true }), /destroy table inet/);
  assert.match(buildDisableScript({ useDestroy: false }), /delete table inet/);
});
