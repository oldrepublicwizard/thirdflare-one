import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { compare, coerce, gt, lt, isPrerelease } from "../lib/update/semver.mjs";
import { buildManifest, parseManifest, pointerForChannel } from "../lib/update/manifest.mjs";
import { pickAsset, pickChannelRelease, findReleaseByTag, clearGithubCache } from "../lib/update/github.mjs";
import { detectInstallFormat, guidedCommands } from "../lib/update/detect-format.mjs";
import { applyAppImageUpdate } from "../lib/update/apply-appimage.mjs";
import { checkForUpdate } from "../lib/update/index.mjs";
import { getVersion } from "../lib/version.mjs";

test("semver coerce and compare", () => {
  assert.equal(coerce("v1.2.3"), "1.2.3");
  assert.equal(coerce("1.2.3-beta.1"), "1.2.3-beta.1");
  assert.equal(compare("1.2.0", "1.1.9"), 1);
  assert.ok(gt("1.2.0", "1.1.0"));
  assert.ok(lt("1.0.0", "1.0.1"));
  assert.ok(isPrerelease("1.0.0-beta.1"));
  assert.equal(isPrerelease("1.0.0"), false);
  assert.ok(gt("1.0.0", "1.0.0-beta.1"));
});

test("manifest channel pointers", () => {
  const manifest = buildManifest({ version: "1.2.0", tag: "v1.2.0", prerelease: false });
  assert.equal(manifest.stable.version, "1.2.0");
  assert.equal(pointerForChannel(manifest, "stable").tag, "v1.2.0");

  const withBeta = buildManifest({
    version: "1.3.0-beta.1",
    tag: "v1.3.0-beta.1",
    prerelease: true,
    previous: manifest
  });
  assert.equal(withBeta.stable.version, "1.2.0");
  assert.equal(withBeta.beta.version, "1.3.0-beta.1");
  assert.equal(pointerForChannel(withBeta, "beta").tag, "v1.3.0-beta.1");
});

test("parseManifest ignores bad input", () => {
  assert.equal(parseManifest(null).stable, null);
  assert.equal(parseManifest({ stable: { version: "nope" } }).stable, null);
});

test("pickChannelRelease prefers stable non-prerelease", () => {
  const releases = [
    { tag: "v1.2.0-beta.1", prerelease: true, draft: false, assets: [] },
    { tag: "v1.1.0", prerelease: false, draft: false, assets: [] }
  ];
  assert.equal(pickChannelRelease(releases, "stable").tag, "v1.1.0");
  assert.equal(pickChannelRelease(releases, "beta").tag, "v1.2.0-beta.1");
});

test("pickAsset matches naming conventions", () => {
  const release = {
    assets: [
      { name: "thirdflare_1.2.0_all.deb", url: "https://example/deb" },
      { name: "thirdflare-1.2.0-x86_64.AppImage", url: "https://example/ai" }
    ]
  };
  assert.equal(pickAsset(release, "appimage").url, "https://example/ai");
  assert.equal(pickAsset(release, "deb").url, "https://example/deb");
  assert.equal(findReleaseByTag([{ tag: "v1.2.0" }], "1.2.0").tag, "v1.2.0");
});

test("detectInstallFormat honors override and APPIMAGE", () => {
  assert.equal(detectInstallFormat({ THIRDFLARE_INSTALL_FORMAT: "rpm" }), "rpm");
  assert.equal(detectInstallFormat({ APPIMAGE: "/tmp/x.AppImage" }), "appimage");
});

test("guidedCommands for deb include dpkg", () => {
  const cmds = guidedCommands("deb", {
    version: "1.2.0",
    tag: "v1.2.0",
    owner: "oldrepublicwizard",
    repo: "cloudflare-one-gui-linux"
  });
  assert.ok(cmds.some((c) => c.includes("dpkg -i")));
});

test("checkForUpdate with mocked GitHub", async () => {
  clearGithubCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("update-manifest.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          schema: 1,
          stable: { version: "9.9.9", tag: "v9.9.9" },
          beta: null
        })
      };
    }
    if (href.includes("/releases")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ([
          {
            id: 1,
            tag_name: "v9.9.9",
            name: "9.9.9",
            prerelease: false,
            draft: false,
            published_at: "2026-01-01T00:00:00Z",
            body: "notes",
            html_url: "https://github.com/example/releases/tag/v9.9.9",
            assets: [
              {
                name: "thirdflare-9.9.9-x86_64.AppImage",
                browser_download_url: "https://example/appimage",
                size: 10,
                content_type: "application/octet-stream"
              }
            ]
          }
        ])
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const result = await checkForUpdate(
      {
        updates: {
          channel: "stable",
          source: { owner: "oldrepublicwizard", repo: "cloudflare-one-gui-linux" }
        }
      },
      { env: { THIRDFLARE_INSTALL_FORMAT: "appimage" } }
    );
    assert.equal(result.updateAvailable, true);
    assert.equal(result.latest, "9.9.9");
    assert.ok(gt(result.latest, getVersion()) || result.latest === "9.9.9");
    assert.equal(result.recommendedAsset.url, "https://example/appimage");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkForUpdate empty releases is graceful", async () => {
  clearGithubCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("update-manifest.json")) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    if (href.includes("/releases")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => []
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const result = await checkForUpdate(
      { updates: { channel: "stable", source: { owner: "nobody", repo: "empty" } } },
      { env: { THIRDFLARE_INSTALL_FORMAT: "deb" } }
    );
    assert.equal(result.updateAvailable, false);
    assert.equal(result.releasesError || result.errors?.releases || null, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("applyAppImageUpdate writes and replaces target", async () => {
  const dir = mkdtempSync(join(tmpdir(), "thirdflare-upd-"));
  const target = join(dir, "ThirdFlare.AppImage");
  writeFileSync(target, "old-binary");
  chmodSync(target, 0o755);

  const payload = Buffer.from("new-appimage-bytes");
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    body: Readable.from([payload])
  });

  try {
    const result = await applyAppImageUpdate(
      { name: "thirdflare-1.0.0-x86_64.AppImage", url: "https://example/ai" },
      {
        env: { XDG_CACHE_HOME: join(dir, "cache") },
        fetchImpl,
        targetPath: target
      }
    );
    assert.equal(result.applied, true);
    assert.equal(result.restartRequired, true);
    assert.equal(readFileSync(target, "utf8"), "new-appimage-bytes");
    assert.ok(existsSync(`${target}.bak`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applyAppImageUpdate rejects non-AppImage name", async () => {
  await assert.rejects(
    () => applyAppImageUpdate(
      { name: "thirdflare.deb", url: "https://example/deb" },
      { targetPath: "/tmp/x.AppImage" }
    ),
    (err) => err.code === "BAD_ASSET"
  );
});
