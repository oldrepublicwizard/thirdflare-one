import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDisableScript, buildEnableScript, KILLSWITCH_TABLE } from "./rules.mjs";

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env || process.env
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
          finish({
            ok: false,
            code: null,
            stdout: stdout.trim(),
            stderr: stderr.trim() || `${cmd} timed out after ${options.timeoutMs}ms`,
            command: `${cmd} ${args.join(" ")}`
          });
        }, options.timeoutMs)
      : null;
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        code: null,
        stdout: "",
        stderr: error.message,
        command: `${cmd} ${args.join(" ")}`
      });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: `${cmd} ${args.join(" ")}`
      });
    });
  });
}

function canTryPkexec(env) {
  if (env.THIRDFLARE_NFT_NO_PKEXEC === "1") return false;
  // Headless CI / non-interactive daemons should not block on polkit prompts.
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY && !env.PKEXEC_UID) return false;
  return true;
}

function missingTable(result) {
  return /No such file|does not exist|not found/i.test(`${result.stderr}\n${result.stdout}`);
}

async function runNftScript(script, { env = process.env } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "thirdflare-ks-"));
  const file = join(dir, "rules.nft");
  writeFileSync(file, script, { mode: 0o600 });

  try {
    let result = await run("nft", ["-f", file], { env, timeoutMs: 8000 });
    if (result.ok) {
      return { ...result, method: "nft" };
    }

    let pk = { ok: false, code: null, stdout: "", stderr: "pkexec skipped" };
    if (canTryPkexec(env)) {
      pk = await run("pkexec", ["nft", "-f", file], { env, timeoutMs: 4000 });
      if (pk.ok) {
        return { ...pk, method: "pkexec" };
      }
    }

    return {
      ok: false,
      code: pk.code ?? result.code,
      stdout: [result.stdout, pk.stdout].filter(Boolean).join("\n"),
      stderr: [result.stderr, pk.stderr].filter(Boolean).join("\n"),
      method: "failed",
      guidedCommands: [
        `sudo nft -f /tmp/thirdflare-killswitch.nft`,
        "# Save the returned script to that path first, then run the command above."
      ],
      script
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * @returns {Promise<{ active: boolean, detail: string, probeError?: boolean, raw?: string }>}
 */
export async function probeKillSwitchActive(env = process.env) {
  const result = await run("nft", ["list", "table", "inet", KILLSWITCH_TABLE], { env });
  if (result.ok) {
    return { active: true, detail: "nftables table loaded", raw: result.stdout };
  }
  if (missingTable(result)) {
    return { active: false, detail: "nftables table not present", raw: result.stderr || result.stdout };
  }
  return {
    active: false,
    detail: result.stderr || result.stdout || "unable to query nftables",
    raw: result.stderr || result.stdout,
    probeError: true
  };
}

/**
 * @param {{ enabled: boolean, allowLan?: boolean, env?: NodeJS.ProcessEnv }} options
 */
export async function applyKillSwitch(options) {
  const enabled = Boolean(options.enabled);
  const allowLan = Boolean(options.allowLan);
  const env = options.env || process.env;

  if (!enabled) {
    const before = await probeKillSwitchActive(env);
    if (!before.active) {
      return {
        ok: true,
        enabled: false,
        desired: false,
        method: "noop",
        detail: before.probeError
          ? `Kill switch already off (${before.detail}).`
          : "Kill switch already off.",
        probe: before
      };
    }
  }

  let script = enabled
    ? buildEnableScript({ allowLan, useDestroy: true })
    : buildDisableScript({ useDestroy: true });

  let result = await runNftScript(script, { env });

  // Older nft without `destroy`
  if (!result.ok && /\bdestroy\b|syntax error/i.test(`${result.stderr}\n${result.stdout}`)) {
    script = enabled
      ? buildEnableScript({ allowLan, useDestroy: false })
      : buildDisableScript({ useDestroy: false });
    result = await runNftScript(script, { env });
  }

  if (!enabled && !result.ok && missingTable(result)) {
    return { ok: true, enabled: false, desired: false, method: "noop", detail: "Kill switch already off." };
  }

  const probe = await probeKillSwitchActive(env);
  const ok = result.ok && (enabled ? probe.active : !probe.active);

  return {
    ok,
    enabled: probe.active,
    desired: enabled,
    method: result.method || "nft",
    detail: ok
      ? (enabled ? "Kill switch rules applied." : "Kill switch rules removed.")
      : (result.stderr || result.stdout || "nft failed"),
    guidedCommands: result.guidedCommands || null,
    script: ok ? undefined : script,
    probe
  };
}
