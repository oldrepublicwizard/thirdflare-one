import { getConfig } from "../config.mjs";
import { applyKillSwitch } from "./apply.mjs";

/** In-process pause while Zero Trust browser/IdP enrollment needs clear egress. */
let enrollmentPause = null;
let resumeTimer = null;

const DEFAULT_PAUSE_MS = 30 * 60 * 1000;

export function getEnrollmentPauseState() {
  if (!enrollmentPause) {
    return { paused: false, wasDesired: false, allowLan: false, at: null, expiresAt: null };
  }
  return {
    paused: true,
    wasDesired: Boolean(enrollmentPause.wasDesired),
    allowLan: Boolean(enrollmentPause.allowLan),
    at: enrollmentPause.at,
    expiresAt: enrollmentPause.expiresAt
  };
}

function clearResumeTimer() {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

/**
 * Temporarily remove nft kill-switch rules without changing persisted desired state.
 * Idempotent while already paused.
 */
export async function beginEnrollmentPause({ env = process.env, pauseMs = DEFAULT_PAUSE_MS } = {}) {
  if (enrollmentPause) {
    return { ok: true, ...getEnrollmentPauseState(), detail: "Enrollment pause already active." };
  }

  const desired = Boolean(getConfig().warp?.killSwitch);
  const allowLan = Boolean(getConfig().warp?.killSwitchAllowLan);

  // Enrollment pause tracks temporary rule removal while persisted desired stays on.
  // When desired is off, begin/end are no-ops even if orphan nft rules remain.
  if (!desired) {
    return {
      ok: true,
      paused: false,
      wasDesired: false,
      allowLan,
      detail: "Kill switch not desired; no pause needed."
    };
  }

  const result = await applyKillSwitch({ enabled: false, allowLan, env });
  if (!result.ok) {
    return {
      ok: false,
      paused: false,
      wasDesired: desired,
      allowLan,
      detail: result.detail || "Failed to pause kill switch for enrollment.",
      guidedCommands: result.guidedCommands,
      script: result.script
    };
  }

  const at = Date.now();
  const expiresAt = at + pauseMs;
  enrollmentPause = { wasDesired: desired, allowLan, at, expiresAt };
  clearResumeTimer();
  resumeTimer = setTimeout(() => {
    endEnrollmentPause({ env, reason: "timeout" }).catch(() => {});
  }, pauseMs);

  return {
    ok: true,
    paused: true,
    wasDesired: desired,
    allowLan,
    at,
    expiresAt,
    detail: "Kill switch paused for Zero Trust enrollment (rules removed; desired state unchanged on disk)."
  };
}

/**
 * Re-apply kill switch if it was desired when pause began (or still desired in config).
 */
export async function endEnrollmentPause({ env = process.env, reason = "manual" } = {}) {
  clearResumeTimer();
  const snapshot = enrollmentPause;
  enrollmentPause = null;

  const desiredNow = Boolean(getConfig().warp?.killSwitch);
  const allowLan = snapshot
    ? Boolean(snapshot.allowLan)
    : Boolean(getConfig().warp?.killSwitchAllowLan);
  const shouldResume = snapshot ? Boolean(snapshot.wasDesired) : desiredNow;

  if (!shouldResume) {
    return {
      ok: true,
      resumed: false,
      reason,
      detail: "No kill switch resume needed."
    };
  }

  const result = await applyKillSwitch({ enabled: true, allowLan, env });
  return {
    ok: result.ok,
    resumed: true,
    reason,
    detail: result.ok
      ? "Kill switch restored after enrollment."
      : (result.detail || "Failed to restore kill switch after enrollment."),
    guidedCommands: result.guidedCommands,
    script: result.script,
    active: result.active
  };
}

/** Actions that need IdP/browser or token callback while kill switch would block egress. */
export const ENROLLMENT_PAUSE_ACTIONS = new Set([
  "registerOrganization",
  "registrationToken"
]);
