/** Lightweight semver helpers (no npm dependency — keeps CI zero-install). */

function parsePart(part) {
  const n = Number(part);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a tag or version string into major.minor.patch[-prerelease].
 * @param {string} input
 * @returns {string|null}
 */
export function coerce(input) {
  if (!input || typeof input !== "string") return null;
  const cleaned = input.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?([-+][0-9A-Za-z.-]+)?/);
  if (!match) return null;
  const major = parsePart(match[1]);
  const minor = parsePart(match[2]);
  const patch = parsePart(match[3]);
  const suffix = match[4] || "";
  return `${major}.${minor}.${patch}${suffix.startsWith("+") ? "" : suffix}`;
}

function split(version) {
  const coerced = coerce(version);
  if (!coerced) return null;
  const [core, pre = ""] = coerced.split("-", 2);
  const [major, minor, patch] = core.split(".").map(parsePart);
  return { major, minor, patch, pre: pre ? pre.split(".") : [] };
}

function comparePre(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1; // release > prerelease
  if (!b.length) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const ln = Number(left);
    const rn = Number(right);
    if (Number.isFinite(ln) && Number.isFinite(rn)) {
      if (ln !== rn) return ln < rn ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

/** @returns {-1|0|1} */
export function compare(a, b) {
  const left = split(a);
  const right = split(b);
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  return comparePre(left.pre, right.pre);
}

export function gt(a, b) {
  return compare(a, b) > 0;
}

export function lt(a, b) {
  return compare(a, b) < 0;
}

export function eq(a, b) {
  return compare(a, b) === 0;
}

export function isPrerelease(version) {
  const parts = split(version);
  return Boolean(parts?.pre?.length);
}
