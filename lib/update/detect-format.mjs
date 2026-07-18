import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SAFE_REF = /^[A-Za-z0-9._-]+$/;
const SAFE_TAG = /^v?[0-9A-Za-z._-]+$/;

export function isSafeGithubRef(value) {
  return typeof value === "string" && SAFE_REF.test(value) && value.length <= 100;
}

export function isSafeTag(value) {
  return typeof value === "string" && SAFE_TAG.test(value) && value.length <= 64;
}

/**
 * Detect how ThirdFlare One was installed.
 * Override with THIRDFLARE_INSTALL_FORMAT=appimage|deb|rpm|flatpak|snap|homebrew|source
 */
export function detectInstallFormat(env = process.env) {
  const override = (env.THIRDFLARE_INSTALL_FORMAT || "").toLowerCase().trim();
  if (override) return override;

  if (env.APPIMAGE || env.APPDIR) return "appimage";
  if (env.FLATPAK_ID) return "flatpak";
  if (env.SNAP) return "snap";

  const argv0 = process.argv[1] || "";
  if (/\.AppImage$/i.test(argv0) || /\.AppImage$/i.test(env.THIRDFLARE_APPIMAGE_PATH || "")) {
    return "appimage";
  }

  if (existsSync("/var/lib/dpkg/info/thirdflare.list") || existsSync("/var/lib/dpkg/info/cloudflare-one-gui.list")) {
    return "deb";
  }

  try {
    execFileSync("rpm", ["-q", "thirdflare"], { stdio: "ignore" });
    return "rpm";
  } catch {
    // not an rpm install
  }

  if (existsSync("/usr/lib/thirdflare/server.js") || existsSync("/usr/lib/cloudflare-one-gui/server.js")) {
    return "deb";
  }

  if (env.HOMEBREW_PREFIX) return "homebrew";

  return "source";
}

export function guidedCommands(format, { version, owner, repo, tag } = {}) {
  if (!isSafeGithubRef(owner || "") || !isSafeGithubRef(repo || "")) {
    return ["# Invalid update source; refusing to generate shell commands."];
  }
  if (tag && !isSafeTag(tag)) {
    return ["# Invalid release tag; refusing to generate shell commands."];
  }

  const v = version && /^[0-9A-Za-z.+-]+$/.test(String(version)) ? String(version) : "latest";
  const t = tag && isSafeTag(tag) ? tag : `v${v}`;
  const base = `https://github.com/${owner}/${repo}/releases/download/${t}`;

  switch (format) {
    case "deb":
      return [
        `curl -fsSL -o /tmp/thirdflare_${v}_all.deb "${base}/thirdflare_${v}_all.deb"`,
        `sudo dpkg -i /tmp/thirdflare_${v}_all.deb`
      ];
    case "rpm":
      return [
        `curl -fsSL -o /tmp/thirdflare-${v}-1.noarch.rpm "${base}/thirdflare-${v}-1.noarch.rpm"`,
        `sudo rpm -Uvh /tmp/thirdflare-${v}-1.noarch.rpm`
      ];
    case "homebrew":
      return ["brew update", "brew upgrade thirdflare-one || brew install thirdflare-one"];
    case "flatpak":
      return ["flatpak update io.github.cloudflare_one_gui_linux.ThirdFlare || echo 'Install from the published Flatpak artifact on GitHub Releases.'"];
    case "snap":
      return ["sudo snap refresh thirdflare || sudo snap install --dangerous thirdflare_*.snap"];
    case "appimage":
      return [`# Download ${base}/thirdflare-${v}-x86_64.AppImage and replace your current AppImage`];
    default:
      return [
        `git -C "$(pwd)" fetch --tags origin`,
        `git checkout ${t}`,
        "npm run check"
      ];
  }
}
