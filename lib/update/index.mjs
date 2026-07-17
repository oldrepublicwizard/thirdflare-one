import { getVersion } from "../version.mjs";
import { coerce, gt, lt } from "./semver.mjs";
import {
  fetchRemoteManifest,
  pointerForChannel,
  readLocalManifest
} from "./manifest.mjs";
import {
  findReleaseByTag,
  listReleases,
  pickAsset,
  pickChannelRelease,
  isTrustedAssetUrl
} from "./github.mjs";
import { detectInstallFormat, guidedCommands, isSafeGithubRef } from "./detect-format.mjs";
import { applyAppImageUpdate } from "./apply-appimage.mjs";

function normalizeSource(config) {
  const owner = config.updates?.source?.owner || "oldrepublicwizard";
  const repo = config.updates?.source?.repo || "cloudflare-one-gui-linux";
  if (!isSafeGithubRef(owner) || !isSafeGithubRef(repo)) {
    const error = new Error("Invalid updates.source owner/repo.");
    error.code = "BAD_SOURCE";
    throw error;
  }
  return { owner, repo };
}

/**
 * Check for updates against manifest + GitHub Releases.
 */
export async function checkForUpdate(config, options = {}) {
  const source = normalizeSource(config);
  const channel = config.updates?.channel || "stable";
  const current = getVersion();
  const format = detectInstallFormat(options.env || process.env);

  let manifest = null;
  let manifestError = null;
  try {
    manifest = await fetchRemoteManifest(source, options);
  } catch (error) {
    manifestError = error.message;
  }
  if (!manifest) manifest = readLocalManifest();

  const pointer = pointerForChannel(manifest, channel);
  let releases = [];
  let releaseError = null;
  try {
    releases = await listReleases(source, options);
  } catch (error) {
    releaseError = error.message;
  }

  let release = null;
  let pointerMatched = false;
  if (pointer?.tag) {
    release = findReleaseByTag(releases, pointer.tag);
    pointerMatched = Boolean(release);
  }
  if (!release) {
    release = pickChannelRelease(releases, channel);
  }

  // Never advertise a manifest version that doesn't match the resolved release.
  const latestVersion = pointerMatched
    ? (coerce(pointer.version) || coerce(release?.tag))
    : (coerce(release?.tag) || null);

  const updateAvailable = Boolean(latestVersion && gt(latestVersion, current));
  const downgrade = Boolean(latestVersion && lt(latestVersion, current));
  const asset = release ? pickAsset(release, format === "source" ? "appimage" : format) : null;

  return {
    ok: true,
    updateAvailable,
    downgrade,
    current,
    latest: latestVersion,
    channel,
    source,
    installFormat: format,
    release: release
      ? {
          tag: release.tag,
          name: release.name,
          prerelease: release.prerelease,
          publishedAt: release.publishedAt,
          htmlUrl: release.htmlUrl,
          body: release.body
        }
      : null,
    assets: release?.assets || [],
    recommendedAsset: asset,
    guidedCommands: latestVersion
      ? guidedCommands(format, {
          version: latestVersion,
          tag: release?.tag || (pointerMatched ? pointer?.tag : null),
          owner: source.owner,
          repo: source.repo
        })
      : [],
    errors: {
      manifest: manifestError,
      releases: releaseError,
      pointerMismatch: pointer?.tag && !pointerMatched
        ? `Manifest tag ${pointer.tag} not found in release list; using channel fallback.`
        : null
    }
  };
}

export async function applyUpdate(config, body = {}, options = {}) {
  if (body?.assetUrl || body?.assetName) {
    return {
      ok: false,
      error: "Client-supplied asset URLs are not allowed. Select a release tag instead."
    };
  }

  const check = await checkForUpdate(config, options);
  const format = check.installFormat;
  let release = check.release;
  let asset = check.recommendedAsset;

  if (body.tag) {
    const releases = await listReleases(check.source, options);
    release = findReleaseByTag(releases, body.tag);
    if (!release) {
      return {
        ok: false,
        error: `Release tag not found: ${body.tag}`
      };
    }
    asset = pickAsset(release, format === "source" ? "appimage" : format);
  }

  if (format !== "appimage") {
    return {
      ok: true,
      mode: "guided",
      applied: false,
      format,
      commands: guidedCommands(format, {
        version: coerce(release?.tag) || check.latest,
        tag: release?.tag,
        owner: check.source.owner,
        repo: check.source.repo
      }),
      restartRequired: false,
      message: `Automatic apply is only supported for AppImage installs (detected: ${format}).`
    };
  }

  if (!asset) {
    return {
      ok: false,
      error: "No AppImage asset found for the selected release.",
      release
    };
  }

  if (!isTrustedAssetUrl(asset.url)) {
    return {
      ok: false,
      error: "Release asset URL is not from a trusted GitHub host.",
      release
    };
  }

  const result = await applyAppImageUpdate(asset, options);
  return { ok: true, ...result, release };
}
