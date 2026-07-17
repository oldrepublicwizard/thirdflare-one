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
      { name: "thirdflare_1.2.0_all.deb", url: "https://github.com/o/r/releases/download/v1.2.0/thirdflare_1.2.0_all.deb" },
      { name: "thirdflare-1.2.0-x86_64.AppImage", url: "https://github.com/o/r/releases/download/v1.2.0/thirdflare-1.2.0-x86_64.AppImage" }
    ]
  };
  assert.equal(pickAsset(release, "appimage").url, "https://github.com/o/r/releases/download/v1.2.0/thirdflare-1.2.0-x86_64.AppImage");
  assert.equal(pickAsset(release, "deb").url, "https://github.com/o/r/releases/download/v1.2.0/thirdflare_1.2.0_all.deb");
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
                browser_download_url: "https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/releases/download/v9.9.9/thirdflare-9.9.9-x86_64.AppImage",
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
    assert.equal(result.latest, "9.9.9");
    assert.equal(result.updateAvailable, gt("9.9.9", getVersion()));
    assert.equal(result.recommendedAsset.url, "https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/releases/download/v9.9.9/thirdflare-9.9.9-x86_64.AppImage");
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
  const target = join(dir, "ThirdFlare-One.AppImage");
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
      { name: "thirdflare-1.0.0-x86_64.AppImage", url: "https://github.com/o/r/releases/download/v1.0.0/thirdflare-1.0.0-x86_64.AppImage" },
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

test("applyUpdate rejects client-supplied assetUrl", async () => {
  const { applyUpdate } = await import("../lib/update/index.mjs");
  const result = await applyUpdate(
    { updates: { channel: "stable", source: { owner: "oldrepublicwizard", repo: "cloudflare-one-gui-linux" } } },
    { assetUrl: "https://evil.example/x.AppImage", assetName: "thirdflare.AppImage" },
    { env: { THIRDFLARE_INSTALL_FORMAT: "appimage" } }
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /not allowed/i);
});

test("applyUpdate requires confirmation token for AppImage", async () => {
  clearGithubCache();
  const originalFetch = globalThis.fetch;
  const assetUrl = "https://github.com/oldrepublicwizard/cloudflare-one-gui-linux/releases/download/v9.9.9/thirdflare-9.9.9-x86_64.AppImage";
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("update-manifest.json")) {
      return { ok: true, status: 200, json: async () => ({ schema: 1, stable: { version: "9.9.9", tag: "v9.9.9" }, beta: null }) };
    }
    if (href.includes("/releases")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ([{
          id: 1,
          tag_name: "v9.9.9",
          name: "9.9.9",
          prerelease: false,
          draft: false,
          published_at: "2026-01-01T00:00:00Z",
          body: "",
          html_url: "https://github.com/example/releases/tag/v9.9.9",
          assets: [{
            name: "thirdflare-9.9.9-x86_64.AppImage",
            browser_download_url: assetUrl,
            size: 10,
            content_type: "application/octet-stream"
          }]
        }])
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const { applyUpdate, prepareApply, clearApplyConfirmTokens } = await import("../lib/update/index.mjs");
    clearApplyConfirmTokens();
    const denied = await applyUpdate(
      { updates: { channel: "stable", source: { owner: "oldrepublicwizard", repo: "cloudflare-one-gui-linux" } } },
      {},
      { env: { THIRDFLARE_INSTALL_FORMAT: "appimage" }, bindHost: "127.0.0.1" }
    );
    assert.equal(denied.ok, false);
    assert.match(denied.error, /confirmation token/i);

    const prep = await prepareApply(
      { updates: { channel: "stable", source: { owner: "oldrepublicwizard", repo: "cloudflare-one-gui-linux" } } },
      {},
      { env: { THIRDFLARE_INSTALL_FORMAT: "appimage" } }
    );
    assert.ok(prep.applyConfirmToken);

    const remoteDenied = await applyUpdate(
      { updates: { channel: "stable", source: { owner: "oldrepublicwizard", repo: "cloudflare-one-gui-linux" } } },
      { confirmToken: prep.applyConfirmToken },
      { env: { THIRDFLARE_INSTALL_FORMAT: "appimage" }, bindHost: "0.0.0.0" }
    );
    assert.equal(remoteDenied.ok, false);
    assert.match(remoteDenied.error, /loopback/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session overrides reject updates.source", async () => {
  const { setSessionOverrides, clearSessionOverrides, getConfig, reloadConfig } = await import("../lib/config.mjs");
  clearSessionOverrides();
  reloadConfig();
  const before = getConfig().updates?.source;
  setSessionOverrides({
    updates: {
      source: { owner: "attacker", repo: "evil" },
      channel: "beta"
    }
  });
  const after = getConfig();
  assert.equal(after.updates.channel, "beta");
  assert.deepEqual(after.updates.source, before);
  clearSessionOverrides();
});

test("parseSha256Sums and untrusted redirect hop", async () => {
  const { parseSha256Sums, fetchTrustedAsset } = await import("../lib/update/apply-appimage.mjs");
  const sums = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  thirdflare-1.0.0-x86_64.AppImage\n";
  assert.equal(parseSha256Sums(sums, "thirdflare-1.0.0-x86_64.AppImage"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  let hops = 0;
  const fetchImpl = async () => {
    hops += 1;
    return {
      status: 302,
      ok: false,
      headers: { get: () => "https://evil.example/payload" }
    };
  };
  await assert.rejects(
    () => fetchTrustedAsset("https://github.com/o/r/releases/download/v1/x.AppImage", { fetchImpl }),
    /Untrusted/
  );
  assert.equal(hops, 1);
});

test("applyUpdate returns guided mode for deb installs", async () => {
  clearGithubCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("update-manifest.json")) {
      return { ok: true, status: 200, json: async () => ({ schema: 1, stable: { version: "0.1.0", tag: "v0.1.0" }, beta: null }) };
    }
    if (href.includes("/releases")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ([{
          id: 1,
          tag_name: "v0.1.0",
          name: "0.1.0",
          prerelease: false,
          draft: false,
          published_at: "2026-01-01T00:00:00Z",
          body: "",
          html_url: "https://github.com/example/releases/tag/v0.1.0",
          assets: []
        }])
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const { applyUpdate } = await import("../lib/update/index.mjs");
    const result = await applyUpdate(
      { updates: { channel: "stable", source: { owner: "oldrepublicwizard", repo: "cloudflare-one-gui-linux" } } },
      {},
      { env: { THIRDFLARE_INSTALL_FORMAT: "deb" } }
    );
    assert.equal(result.ok, true);
    assert.equal(result.mode, "guided");
    assert.equal(result.applied, false);
    assert.ok(result.commands.some((c) => c.includes("dpkg")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("guidedCommands rejects unsafe owner", () => {
  const cmds = guidedCommands("deb", {
    version: "1.0.0",
    tag: "v1.0.0",
    owner: 'foo";rm -rf /;echo "',
    repo: "cloudflare-one-gui-linux"
  });
  assert.ok(cmds[0].startsWith("# Invalid"));
});

test("isTrustedAssetUrl allowlists GitHub hosts only", async () => {
  const { isTrustedAssetUrl } = await import("../lib/update/github.mjs");
  assert.equal(isTrustedAssetUrl("https://objects.githubusercontent.com/foo"), true);
  assert.equal(isTrustedAssetUrl("https://evil.example/x.AppImage"), false);
  assert.equal(isTrustedAssetUrl("http://github.com/x"), false);
});
