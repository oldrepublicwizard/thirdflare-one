/**
 * Thin UI smoke using Playwright library (Plane M).
 * Boots the daemon with mock warp-cli, opens Chromium, checks Home + Account outcomes.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { join } from "node:path";

const root = process.cwd();
const port = Number(process.env.CI_UI_PORT || 14740);
const mockWarp = process.env.WARP_CLI || join(root, "scripts/mock-warp-cli.mjs");
const systemChrome = ["/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome-stable"].find(
  (p) => existsSync(p)
);

function httpJson(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: body
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        let text = "";
        res.on("data", (c) => {
          text += c;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null });
          } catch {
            resolve({ status: res.statusCode, json: null });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    WARP_CLI: mockWarp,
    THIRDFLARE_WEBUI: "1",
    THIRDFLARE_NOTIFICATIONS: "0",
    THIRDFLARE_NFT_NO_PKEXEC: "1",
    MOCK_WARP_STATE: join(root, ".tmp-mock-warp-ui.json")
  },
  stdio: "ignore"
});

async function waitHealth() {
  for (let i = 0; i < 75; i++) {
    try {
      const res = await httpJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become healthy in time");
}

try {
  await waitHealth();
  await httpJson("POST", "/api/action", { action: "disconnect" });
  await httpJson("POST", "/api/action", { action: "deleteRegistration" });

  const launchOpts = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  };
  if (systemChrome && process.env.PLAYWRIGHT_USE_BUNDLED !== "1") {
    launchOpts.executablePath = systemChrome;
  }
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const toggle = page.locator("[data-testid='connection-toggle']");
  await toggle.waitFor({ timeout: 20000 });
  await httpJson("POST", "/api/action", { action: "register" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await toggle.waitFor({ timeout: 20000 });
  await toggle.click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector("[data-testid='connection-toggle']");
      return el && (el.getAttribute("aria-pressed") === "true" || /disconnect/i.test(el.textContent || ""));
    },
    { timeout: 15000 }
  );

  await page.locator("[data-nav='account']").click();
  await page.locator("[data-testid='account-register']").waitFor({ timeout: 20000 });
  await httpJson("POST", "/api/action", { action: "deleteRegistration" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-nav='account']").click();
  await page.locator("[data-testid='account-register']").click();
  await page.waitForFunction(
    () => {
      const strip = document.querySelector(".account-status-strip");
      return strip && /Registered/i.test(strip.textContent || "") && !/Not registered/i.test(strip.textContent || "");
    },
    { timeout: 15000 }
  );
  await browser.close();
  console.log("UI smoke OK (connect toggle + account register outcomes)");
  process.exitCode = 0;
} catch (err) {
  console.error("UI smoke FAIL", err);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, 500).unref();
}
