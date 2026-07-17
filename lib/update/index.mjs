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
  pickChannelRelease
} from "./github.mjs";
import { detectInstallFormat, guidedCommands } from "./detect-format.mjs";
import { applyAppImageUpdate } from "./apply-appimage.mjs";

/**
 * Check for updates against manifest + GitHub Releases.
 */
export async function checkForUpdate(config, options = {}) {
  const source = {
    owner: config.updates?.source?.owner || "oldrepublicwizard",
    repo: config.updates?.source?.repo || "cloudflare-one-gui-linux"
  };
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
  if (pointer?.tag) {
    release = findReleaseByTag(releases, pointer.tag);
  }
  if (!release) {
    release = pickChannelRelease(releases, channel);
  }

  const latestVersion = coerce(pointer?.version || release?.tag) || null;
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
          tag: release?.tag || pointer?.tag,
          owner: source.owner,
          repo: source.repo
        })
      : [],
    errors: {
      manifest: manifestError,
      releases: releaseError
    }
  };
}

export async function applyUpdate(config, body = {}, options = {}) {
  const check = await checkForUpdate(config, options);
  const format = check.installFormat;
  const tag = body.tag || check.release?.tag;
  let release = check.release;
  let asset = check.recommendedAsset;

  if (body.tag || body.assetUrl) {
    const source = check.source;
    const releases = await listReleases(source, options);
    release = findReleaseByTag(releases, tag) || release;
    if (body.assetUrl) {
      asset = {
        name: body.assetName || "thirdflare.AppImage",
        url: body.assetUrl,
        size: body.assetSize || 0
      };
    } else if (release) {
      asset = pickAsset(release, format === "source" ? "appimage" : format);
    }
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

  const result = await applyAppImageUpdate(asset, options);
  return { ok: true, ...result, release };
}
